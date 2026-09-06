//! Voz neural local via Kokoro, ou vozes do macOS via `say`.
//! As vozes neurais aparecem quando o runtime e o modelo estão instalados.
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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

use super::error::{EngineError, Result};

/// Processo do `say` em curso. Um por vez — falar de novo corta o anterior.
static SPEAKING: Mutex<Option<Child>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

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
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    kill_current();

    if let Some(neural_voice) = voice.as_deref().and_then(super::neural::voice_id) {
        std::thread::spawn(move || {
            let path =
                match super::neural::render(&text, neural_voice, rate.unwrap_or(175), generation) {
                    Ok(path) => path,
                    Err(message) => {
                        super::diag::log("tts", format!("Kokoro falhou: {message}"));
                        if GENERATION.load(Ordering::SeqCst) == generation {
                            let _ = app.emit(
                                "tts://error",
                                serde_json::json!({ "id": id, "message": message }),
                            );
                        }
                        return;
                    }
                };
            // A pessoa pode interromper durante a síntese. Nunca toca áudio obsoleto.
            let played = (|| -> std::result::Result<bool, String> {
                let mut slot = SPEAKING.lock().map_err(|e| e.to_string())?;
                if GENERATION.load(Ordering::SeqCst) != generation {
                    return Ok(false);
                }
                let child = Command::new("/usr/bin/afplay")
                    .arg(&path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| e.to_string())?;
                let pid = child.id();
                *slot = Some(child);
                drop(slot);
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(40));
                    let mut slot = SPEAKING.lock().map_err(|e| e.to_string())?;
                    match slot.as_mut() {
                        Some(child) if child.id() == pid => {
                            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                                *slot = None;
                                if !status.success() {
                                    return Err("Não foi possível reproduzir a voz local".into());
                                }
                                return Ok(true);
                            }
                        }
                        _ => return Ok(false),
                    }
                }
            })();
            let _ = std::fs::remove_file(path);
            if GENERATION.load(Ordering::SeqCst) == generation {
                match played {
                    Ok(true) => {
                        let _ = app.emit("tts://done", serde_json::json!({ "id": id }));
                    }
                    Err(message) => {
                        let _ = app.emit(
                            "tts://error",
                            serde_json::json!({ "id": id, "message": message }),
                        );
                    }
                    _ => {}
                }
            }
        });
        return Ok(());
    }

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

    super::diag::log(
        "tts",
        format!(
            "falando id={id} voz={:?} rate={:?} chars={}",
            voice.as_deref().unwrap_or("(padrão)"),
            rate,
            clean.chars().count()
        ),
    );
    let mut child = cmd.spawn().map_err(|e| {
        super::diag::log("tts", format!("ERRO ao rodar o `say`: {e}"));
        EngineError::Io(e)
    })?;
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
    GENERATION.fetch_add(1, Ordering::SeqCst);
    kill_current();
}

/// Vozes instaladas no sistema pro idioma pedido (ex.: "pt_BR").
/// Devolve `[{ name, locale }]`.
pub fn voices(locale_prefix: &str) -> Vec<serde_json::Value> {
    let mut available = Vec::new();
    if "pt_BR".starts_with(locale_prefix) && super::neural::available() {
        for name in ["Alex · IA local", "Dora · IA local", "Santa · IA local"] {
            available.push(serde_json::json!({ "name": name, "locale": "pt_BR" }));
        }
    }
    let _ = locale_prefix;
    available
}
