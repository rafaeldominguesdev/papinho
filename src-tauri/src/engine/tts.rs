//! Fala (text-to-speech) usando o `say` do macOS — as mesmas vozes do
//! sistema (Luciana, Flo, Reed… em pt-BR), sem dependência nova.
//!
//! Por que `say` e não `AVSpeechSynthesizer`: mesma qualidade de voz (é o
//! mesmo motor), matar o processo interrompe a fala na hora (barge-in), e
//! evita mais um módulo objc2 pra manter.
//!
//! A UI fala **frase a frase** conforme a resposta chega — assim o Papinho
//! começa a responder antes do modelo terminar de escrever.
//!
//! Eventos: `tts://done` `{ id }` quando aquela fala acaba (ou é cortada).

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

use super::error::{EngineError, Result};

/// Processo do `say` em curso. Um por vez — falar de novo corta o anterior.
static SPEAKING: Mutex<Option<Child>> = Mutex::new(None);

fn kill_current() {
    if let Ok(mut guard) = SPEAKING.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Fala `text`. Corta o que estiver falando. Emite `tts://done { id }` no fim.
/// `rate` é em palavras por minuto (o padrão do macOS é ~175).
pub fn speak(
    app: AppHandle,
    id: String,
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<()> {
    kill_current();

    let clean = text.trim();
    if clean.is_empty() {
        let _ = app.emit("tts://done", serde_json::json!({ "id": id }));
        return Ok(());
    }

    let mut cmd = Command::new("say");
    if let Some(v) = voice.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg("-v").arg(v);
    }
    if let Some(r) = rate.filter(|r| *r >= 80 && *r <= 400) {
        cmd.arg("-r").arg(r.to_string());
    }
    // o texto vai pelo stdin: evita qualquer problema de aspas/tamanho
    cmd.arg("-f")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(EngineError::Io)?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(clean.as_bytes());
    }

    let pid = child.id();
    if let Ok(mut guard) = SPEAKING.lock() {
        *guard = Some(child);
    }

    // espera o fim numa thread e avisa a UI (pra ela emendar a próxima frase)
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(60));
            let mut guard = match SPEAKING.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            match guard.as_mut() {
                // outro `speak` já assumiu o slot: esta fala foi cortada
                Some(c) if c.id() != pid => break,
                Some(c) => match c.try_wait() {
                    Ok(Some(_)) => {
                        *guard = None;
                        break;
                    }
                    Ok(None) => continue,
                    Err(_) => break,
                },
                None => break, // foi cortada
            }
        }
        let _ = app.emit("tts://done", serde_json::json!({ "id": id }));
    });

    Ok(())
}

/// Corta a fala em curso (barge-in).
pub fn stop() {
    kill_current();
}

/// Vozes instaladas no sistema pro idioma pedido (ex.: "pt_BR").
/// Devolve `[{ name, locale }]`.
pub fn voices(locale_prefix: &str) -> Vec<serde_json::Value> {
    let out = match Command::new("say").arg("-v").arg("?").output() {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            // "Luciana             pt_BR    # Olá, meu nome é Luciana."
            let (left, _) = line.split_once('#')?;
            let mut parts = left.split_whitespace().collect::<Vec<_>>();
            let locale = parts.pop()?.to_string();
            let name = parts.join(" ");
            if name.is_empty() || !locale.starts_with(locale_prefix) {
                return None;
            }
            Some(serde_json::json!({ "name": name, "locale": locale }))
        })
        .collect()
}
