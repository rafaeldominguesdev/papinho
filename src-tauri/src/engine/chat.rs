//! Chat "puro": roda a CLI da IA escolhida em modo streaming e devolve a
//! resposta pela stream de eventos Tauri. Reaproveita a autenticação de quem
//! já está logado em cada CLI — o Papinho não guarda chave de API nenhuma.
//!
//! Provedores (ver `providers.rs`) e o modo headless de cada um:
//! - claude: `--print --output-format stream-json` (eventos da Anthropic)
//! - codex:  `exec --json` (item.completed com a mensagem inteira)
//! - gemini: `-p … -o stream-json` ({type:message, role:assistant, delta})
//! - cursor: `-p … --output-format stream-json --stream-partial-output`
//! - grok:   `-p …` (texto puro, sem JSON)
//!
//! Só o `claude` tem retomada de sessão por UUID aqui. Nos outros o histórico
//! da conversa vai embutido no prompt — mais simples e previsível do que
//! adivinhar o formato de sessão de cada CLI, ao custo de reenviar o papo.
//!
//! Multi-turno: cada conversa tem um `session_id` (UUID gerado na UI). A
//! primeira mensagem usa `--session-id <uuid>`; as seguintes usam
//! `--resume <uuid>` (o `claude` mantém o histórico daquela sessão).
//!
//! `--model` e `--effort` (low/medium/high/xhigh/max) vão em TODA mensagem —
//! dá pra trocar no meio da conversa.
//!
//! Imagens: quando vêm, o prompt entra por `--input-format stream-json` no
//! stdin (uma linha JSON com blocos `image` + `text`), como a API espera.
//!
//! Eventos (todos com `turnId` = id da mensagem em curso):
//! - `chat://delta`   `{ turnId, text }`
//! - `chat://done`    `{ turnId, text }`
//! - `chat://error`   `{ turnId, message }`

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::engine::error::EngineError;
use crate::engine::Result;

const SYSTEM: &str = "Você é o Papinho, um assistente de chat de propósito geral. \
Responda em português do Brasil, de forma direta e útil. Você é só conversa: não tem \
ferramentas, terminal nem acesso a arquivos.";

/// Modo conversa (voz): vai em TODO turno falado — inclusive nos `--resume`,
/// porque o `--append-system-prompt` também vale pra sessão retomada. O que a
/// pessoa ouve é um `say` lendo o texto, então nada de markdown, listas ou
/// blocos de código, e resposta curta: cada frase a mais é tempo de áudio.
const SYSTEM_VOICE: &str = "MODO CONVERSA POR VOZ: a pessoa está FALANDO com você e vai \
OUVIR a sua resposta em áudio. Fale como gente ao telefone: 1 a 3 frases curtas, no máximo \
umas 60 palavras, direto ao ponto. NADA de markdown, títulos, listas numeradas, emojis, \
tabelas ou blocos de código — só texto corrido pra ser lido em voz alta. Escreva números, \
símbolos e siglas por extenso quando ajudar a pronúncia. Se a pergunta pedir uma resposta \
longa, dê o resumo falado e ofereça detalhar. O texto vem de reconhecimento de fala: pode \
ter palavra trocada — entenda pelo contexto em vez de reclamar da transcrição.";

/// Uma mensagem já trocada nesta conversa. Vai embutida no prompt das CLIs
/// que não têm retomada de sessão por id aqui (todas menos o `claude`).
#[derive(Deserialize)]
pub struct HistoryMsg {
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatImage {
    /// ex: "image/png", "image/jpeg"
    pub media_type: String,
    /// conteúdo do arquivo em base64
    pub data: String,
}

/// Manda uma mensagem e streama a resposta.
#[allow(clippy::too_many_arguments)]
pub async fn send(
    app: AppHandle,
    turn_id: String,
    session_id: String,
    text: String,
    model: String,
    effort: Option<String>,
    user_name: Option<String>,
    system_extra: Option<String>,
    images: Vec<ChatImage>,
    resume: bool,
    voice: bool,
    provider: String,
    history: Vec<HistoryMsg>,
) -> Result<()> {
    let prov = super::providers::find(&provider)
        .ok_or_else(|| EngineError::Other(format!("IA desconhecida: {provider}")))?;
    if super::providers::which(&prov.bin).is_none() {
        return Err(EngineError::Provider(format!(
            "a CLI do {} não está instalada ({}). Instale com: {}",
            prov.company, prov.bin, prov.install
        )));
    }

    // system prompt montado uma vez — cada CLI o entrega do seu jeito
    let mut sys = SYSTEM.to_string();
    if let Some(n) = user_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let n: String = n.chars().take(40).collect();
        sys.push_str(&format!(
            " O usuário quer ser chamado de \"{n}\" — use esse nome ao se dirigir a ele."
        ));
    }
    if let Some(x) = system_extra
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        sys.push(' ');
        sys.push_str(x);
    }
    if voice {
        sys.push(' ');
        sys.push_str(SYSTEM_VOICE);
    }

    if provider != "claude" {
        if !images.is_empty() {
            return Err(EngineError::Other(format!(
                "por enquanto só o Claude recebe imagem aqui — {} ainda não",
                prov.company
            )));
        }
        return send_cli(app, turn_id, prov, text, model, sys, history).await;
    }

    let mut cmd = Command::new("claude");
    cmd.current_dir(std::env::temp_dir())
        .arg("--print")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--model")
        .arg(&model);

    if let Some(e) = effort.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg("--effort").arg(e);
    }

    if resume {
        cmd.arg("--resume").arg(&session_id);
        // sessão já existe: o system prompt base já foi dado na 1ª mensagem.
        // Só o modo voz precisa reforçar as regras de fala a cada turno.
        if voice {
            cmd.arg("--append-system-prompt").arg(SYSTEM_VOICE);
        }
    } else {
        cmd.arg("--session-id").arg(&session_id);
        cmd.arg("--append-system-prompt").arg(&sys);
    }

    let has_images = !images.is_empty();
    if has_images {
        cmd.arg("--input-format").arg("stream-json");
        cmd.stdin(Stdio::piped());
    } else {
        cmd.arg(&text);
        cmd.stdin(Stdio::null());
    }

    cmd.env("PATH", crate::engine::shell_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // dogfooding: o DevTerm pode ter sido lançado de dentro de um Claude Code.
    for (k, _) in std::env::vars() {
        let ku = k.to_ascii_uppercase();
        if ku == "CLAUDECODE" || ku.starts_with("CLAUDE_CODE") || ku.starts_with("CLAUDE_CONFIG") {
            cmd.env_remove(&k);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| EngineError::Provider(format!("claude: {e}")))?;

    if has_images {
        let mut content: Vec<Value> = images
            .iter()
            .map(|img| {
                serde_json::json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img.media_type,
                        "data": img.data,
                    }
                })
            })
            .collect();
        content.push(serde_json::json!({ "type": "text", "text": text }));
        let line = serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": content },
        })
        .to_string();
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(line.as_bytes()).await;
            let _ = stdin.write_all(b"\n").await;
            // fecha o stdin pro claude saber que a entrada acabou
            drop(stdin);
        }
    }

    let stdout = child.stdout.take().expect("stdout piped");
    let mut stderr = child.stderr.take().expect("stderr piped");

    let err_buf = Arc::new(Mutex::new(String::new()));
    let err_buf2 = err_buf.clone();
    tokio::spawn(async move {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s).await;
        *err_buf2.lock().unwrap() = s;
    });

    let mut lines = BufReader::new(stdout).lines();
    let mut acc = String::new();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match v["type"].as_str().unwrap_or("") {
            "stream_event" => {
                let ev = &v["event"];
                if ev["type"] == "content_block_delta" {
                    if let Some(t) = ev["delta"]["text"].as_str() {
                        acc.push_str(t);
                        let _ = app.emit(
                            "chat://delta",
                            serde_json::json!({ "turnId": turn_id, "text": t }),
                        );
                    }
                }
            }
            "assistant" => {
                if acc.is_empty() {
                    if let Some(arr) = v["message"]["content"].as_array() {
                        for b in arr {
                            if let Some(t) = b["text"].as_str() {
                                acc.push_str(t);
                                let _ = app.emit(
                                    "chat://delta",
                                    serde_json::json!({ "turnId": turn_id, "text": t }),
                                );
                            }
                        }
                    }
                }
            }
            "result" if acc.is_empty() => {
                if let Some(r) = v["result"].as_str() {
                    acc = r.to_string();
                    let _ = app.emit(
                        "chat://delta",
                        serde_json::json!({ "turnId": turn_id, "text": r }),
                    );
                }
            }
            _ => {}
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| EngineError::Provider(format!("claude wait: {e}")))?;

    if acc.trim().is_empty() {
        let err = err_buf.lock().unwrap().clone();
        let snippet: String = err.chars().take(500).collect();
        let msg = if status.success() {
            "resposta vazia do claude".to_string()
        } else if snippet.trim().is_empty() {
            format!("claude saiu com {status}")
        } else {
            snippet
        };
        let _ = app.emit(
            "chat://error",
            serde_json::json!({ "turnId": turn_id, "message": msg }),
        );
        return Ok(());
    }

    let _ = app.emit(
        "chat://done",
        serde_json::json!({ "turnId": turn_id, "text": acc }),
    );
    Ok(())
}

/// Monta o prompt das CLIs sem sessão: system + o papo até aqui + a pergunta.
fn build_prompt(sys: &str, history: &[HistoryMsg], text: &str) -> String {
    let mut p = String::with_capacity(text.len() + 512);
    p.push_str(sys);
    p.push_str("\n\n");
    if !history.is_empty() {
        p.push_str("--- conversa até aqui ---\n");
        for m in history {
            let quem = if m.role == "assistant" { "Você" } else { "Usuário" };
            let corpo = m.content.trim();
            if corpo.is_empty() {
                continue;
            }
            p.push_str(quem);
            p.push_str(": ");
            p.push_str(corpo);
            p.push_str("\n\n");
        }
        p.push_str("--- fim do histórico ---\n\n");
    }
    p.push_str("Usuário: ");
    p.push_str(text);
    p
}

/// Conversa com as CLIs que não são o `claude`. Cada uma tem o seu jeito de
/// receber o prompt e de cuspir a resposta; o que sai daqui são os mesmos
/// `chat://delta|done|error` de sempre, então a UI não sabe a diferença.
async fn send_cli(
    app: AppHandle,
    turn_id: String,
    prov: super::providers::Provider,
    text: String,
    model: String,
    sys: String,
    history: Vec<HistoryMsg>,
) -> Result<()> {
    let prompt = build_prompt(&sys, &history, &text);
    // o `model` que vem da UI é o `arg` do catálogo (vazio = escolha da CLI)
    let model = model.trim().to_string();

    let mut cmd = Command::new(&prov.bin);
    cmd.current_dir(std::env::temp_dir());
    match prov.id.as_str() {
        "codex" => {
            cmd.arg("exec").arg("--json").arg("--skip-git-repo-check");
            if !model.is_empty() {
                cmd.arg("--model").arg(&model);
            }
            cmd.arg(&prompt);
        }
        "gemini" => {
            // sem `--approval-mode plan`: medido aqui, ele levou 5 minutos
            // pra responder "ok" contra 8 segundos no modo normal.
            cmd.arg("-o").arg("stream-json").arg("--skip-trust");
            if !model.is_empty() {
                cmd.arg("-m").arg(&model);
            }
            cmd.arg("-p").arg(&prompt);
        }
        "cursor" => {
            cmd.arg("--output-format")
                .arg("stream-json")
                .arg("--stream-partial-output")
                .arg("--trust");
            if !model.is_empty() {
                cmd.arg("-m").arg(&model);
            }
            cmd.arg("-p").arg(&prompt);
        }
        "grok" => {
            if !model.is_empty() {
                cmd.arg("-m").arg(&model);
            }
            cmd.arg("-p").arg(&prompt);
        }
        other => {
            return Err(EngineError::Other(format!("IA sem suporte ainda: {other}")));
        }
    }

    cmd.env("PATH", crate::engine::shell_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| EngineError::Provider(format!("{}: {e}", prov.bin)))?;

    let stdout = child.stdout.take().expect("stdout piped");
    let mut stderr = child.stderr.take().expect("stderr piped");
    let err_buf = Arc::new(Mutex::new(String::new()));
    let err_buf2 = err_buf.clone();
    tokio::spawn(async move {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s).await;
        *err_buf2.lock().unwrap() = s;
    });

    let mut lines = BufReader::new(stdout).lines();
    let mut acc = String::new();
    let emit = |app: &AppHandle, acc: &mut String, t: &str| {
        if t.is_empty() {
            return;
        }
        acc.push_str(t);
        let _ = app.emit(
            "chat://delta",
            serde_json::json!({ "turnId": turn_id, "text": t }),
        );
    };

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // o Grok fala texto puro: cada linha já é resposta
        if prov.id == "grok" {
            emit(&app, &mut acc, line);
            emit(&app, &mut acc, "\n");
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue; // ruído da CLI (aviso, barra de progresso…)
        };
        match (prov.id.as_str(), v["type"].as_str().unwrap_or("")) {
            // {"type":"item.completed","item":{"type":"agent_message","text":…}}
            ("codex", "item.completed") => {
                if v["item"]["type"] == "agent_message" {
                    if let Some(t) = v["item"]["text"].as_str() {
                        emit(&app, &mut acc, t);
                    }
                }
            }
            // {"type":"message","role":"assistant","content":"…","delta":true}
            ("gemini", "message") => {
                if v["role"] == "assistant" {
                    if let Some(t) = v["content"].as_str() {
                        emit(&app, &mut acc, t);
                    }
                }
            }
            // {"type":"assistant","message":{"content":[{"type":"text","text":…}]}}
            ("cursor", "assistant") => {
                if let Some(arr) = v["message"]["content"].as_array() {
                    for b in arr {
                        if let Some(t) = b["text"].as_str() {
                            emit(&app, &mut acc, t);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| EngineError::Provider(format!("{} wait: {e}", prov.bin)))?;

    if acc.trim().is_empty() {
        let err = err_buf.lock().unwrap().clone();
        let snippet: String = err.chars().take(500).collect();
        let msg = if snippet.trim().is_empty() {
            format!("resposta vazia do {} ({status})", prov.product)
        } else {
            snippet
        };
        let _ = app.emit(
            "chat://error",
            serde_json::json!({ "turnId": turn_id, "message": msg }),
        );
        return Ok(());
    }

    let _ = app.emit(
        "chat://done",
        serde_json::json!({ "turnId": turn_id, "text": acc.trim() }),
    );
    Ok(())
}

/// Lê um arquivo de imagem do disco e devolve `{ media_type, data(base64) }`
/// pro front mandar junto de uma mensagem do chat.
pub fn read_image_b64(path: &str) -> Result<ChatImage> {
    use base64::Engine as _;

    let bytes = std::fs::read(path).map_err(EngineError::Io)?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err(EngineError::Other("imagem acima de 8 MB".into()));
    }
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let media_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        other => {
            return Err(EngineError::Other(format!(
                "formato não suportado: {other}"
            )))
        }
    }
    .to_string();
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(ChatImage { media_type, data })
}
