//! Comandos Tauri (UI -> motor).

use tauri::AppHandle;

use super::error::{EngineError, Result};
use super::skills;

/// Manda uma mensagem e streama a resposta por `chat://delta|done|error`.
/// Roda `claude --print` reaproveitando o login de quem já usa o `claude`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn chat_send(
    app: AppHandle,
    turn_id: String,
    session_id: String,
    text: String,
    model: String,
    effort: Option<String>,
    user_name: Option<String>,
    system_extra: Option<String>,
    images: Vec<super::chat::ChatImage>,
    resume: bool,
    // `voice`: turno do modo conversa — injeta as regras de fala e pede resposta curta
    voice: Option<bool>,
    // `provider`: qual IA responde ("claude" por padrão) — ver providers.rs
    provider: Option<String>,
    // `history`: o papo até aqui, pras CLIs sem retomada de sessão
    history: Option<Vec<super::chat::HistoryMsg>>,
) -> Result<()> {
    super::chat::send(
        app,
        turn_id,
        session_id,
        text,
        model,
        effort,
        user_name,
        system_extra,
        images,
        resume,
        voice.unwrap_or(false),
        provider.unwrap_or_else(|| "claude".into()),
        history.unwrap_or_default(),
    )
    .await
}

/// As IAs que o Papinho conhece, com quais estão instaladas na máquina.
/// A tela de Config vive disso.
#[tauri::command]
pub async fn list_providers() -> Result<Vec<super::providers::Provider>> {
    tokio::task::spawn_blocking(super::providers::detect)
        .await
        .map_err(|e| EngineError::Other(e.to_string()))
}

/// Lê uma imagem do disco → `{ mediaType, data }` (base64) pro chat.
#[tauri::command]
pub fn read_chat_image(path: String) -> Result<serde_json::Value> {
    let img = super::chat::read_image_b64(&path)?;
    Ok(serde_json::json!({ "mediaType": img.media_type, "data": img.data }))
}

#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<skills::InstalledSkill>> {
    tokio::task::spawn_blocking(skills::list_installed)
        .await
        .map_err(|e| EngineError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn install_skill(
    repo: String,
    subdir: String,
    name: String,
) -> Result<skills::InstalledSkill> {
    tokio::task::spawn_blocking(move || skills::install(&repo, &subdir, &name))
        .await
        .map_err(|e| EngineError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn remove_installed_skill(name: String) -> Result<()> {
    tokio::task::spawn_blocking(move || skills::remove(&name))
        .await
        .map_err(|e| EngineError::Other(e.to_string()))?
}

/// A UI manda pro log de diagnóstico o que só ela vê (erro de invoke, evento
/// de erro que apareceu na tela). Ver `engine/diag.rs`.
#[tauri::command]
pub async fn diag_log(tag: String, message: String) -> Result<()> {
    super::diag::log(&tag, message);
    Ok(())
}

/* ------------------------------------------------------------------ voz -- */

/// Fala um trecho (frase a frase, pro modo conversa começar a responder
/// antes do modelo terminar). Corta o que estiver falando.
#[tauri::command]
pub async fn tts_speak(
    app: AppHandle,
    id: String,
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<()> {
    super::tts::speak(app, id, text, voice, rate)
}

/// Corta a fala em curso (quando a pessoa interrompe).
#[tauri::command]
pub async fn tts_stop() -> Result<()> {
    super::tts::stop();
    Ok(())
}

/// Vozes do sistema pro idioma (ex.: "pt_BR").
#[tauri::command]
pub async fn tts_voices(locale: String) -> Result<Vec<serde_json::Value>> {
    tokio::task::spawn_blocking(move || super::tts::voices(&locale))
        .await
        .map_err(|e| EngineError::Other(e.to_string()))
}
