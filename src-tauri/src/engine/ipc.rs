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
    )
    .await
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
