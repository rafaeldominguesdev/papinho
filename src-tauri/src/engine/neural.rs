//! Kokoro offline; the model stays loaded between sentences.
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

static WORKER: Mutex<Option<Worker>> = Mutex::new(None);

pub fn root() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
        .join("Library/Application Support/Papinho/voice")
}

pub fn available() -> bool {
    ["venv/bin/python", "kokoro-v1.0.onnx", "voices-v1.0.bin"]
        .iter()
        .all(|file| root().join(file).is_file())
}

pub fn voice_id(name: &str) -> Option<&'static str> {
    match name {
        "Alex · IA local" => Some("pm_alex"),
        "Dora · IA local" => Some("pf_dora"),
        "Santa · IA local" => Some("pm_santa"),
        _ => None,
    }
}

struct Worker {
    child: Child,
    input: ChildStdin,
    output: mpsc::Receiver<String>,
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Worker {
    fn start() -> Result<Self, String> {
        let mut child = Command::new(root().join("venv/bin/python"))
            .arg("-u")
            .arg("-c")
            .arg(include_str!("../../../scripts/neural_voice.py"))
            .arg(root())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        let input = child.stdin.take().ok_or("stdin de voz indisponível")?;
        let stdout = child.stdout.take().ok_or("stdout de voz indisponível")?;
        let (tx, output) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            input,
            output,
        })
    }

    fn render(&mut self, text: &str, voice: &str, rate: u32, path: &PathBuf) -> Result<(), String> {
        let request =
            serde_json::json!({ "text": text, "voice": voice, "rate": rate, "path": path });
        writeln!(self.input, "{request}").map_err(|e| e.to_string())?;
        self.input.flush().map_err(|e| e.to_string())?;
        let line = self
            .output
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| "O motor de voz local não respondeu. Tente novamente.".to_string())?;
        let result: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if result["ok"] != true {
            return Err(result["error"]
                .as_str()
                .unwrap_or("Falha na voz local")
                .to_string());
        }
        super::diag::log("tts", format!("Kokoro: {result}"));
        Ok(())
    }
}

pub fn render(text: &str, voice: &str, rate: u32, generation: u64) -> Result<PathBuf, String> {
    let mut slot = WORKER.lock().map_err(|e| e.to_string())?;
    if slot.is_none() {
        *slot = Some(Worker::start()?);
    }
    let path = root().join(format!("speech-{}-{generation}.wav", std::process::id()));
    let result = slot.as_mut().unwrap().render(text, voice, rate, &path);
    if let Err(error) = result {
        *slot = None;
        let _ = std::fs::remove_file(&path);
        return Err(error);
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_routes_known_neural_voices() {
        assert_eq!(super::voice_id("Alex · IA local"), Some("pm_alex"));
        assert_eq!(super::voice_id("Luciana"), None);
    }

    #[test]
    #[ignore = "requires the installed local voice model"]
    fn synthesizes_through_persistent_worker() {
        assert!(super::available());
        for generation in [90001, 90002] {
            let path =
                super::render("Olá. Como você está hoje?", "pm_alex", 175, generation).unwrap();
            let bytes = std::fs::read(&path).unwrap();
            assert!(bytes.len() > 48000);
            assert_eq!(&bytes[..4], b"RIFF");
            std::fs::remove_file(path).unwrap();
        }
        // A voz inválida precisa retornar erro, liberar o worker e permitir retomar.
        assert!(super::render("Olá.", "invalid", 175, 90003).is_err());
        let path = super::render("Tudo certo.", "pf_dora", 175, 90004).unwrap();
        std::fs::remove_file(path).unwrap();
    }
}
