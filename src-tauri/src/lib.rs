pub mod engine;

use engine::{ipc, voice};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ipc::chat_send,
            ipc::read_chat_image,
            ipc::list_installed_skills,
            ipc::install_skill,
            ipc::remove_installed_skill,
            ipc::diag_log,
            ipc::tts_speak,
            ipc::tts_stop,
            ipc::tts_voices,
            voice::voice_start,
            voice::voice_stop,
            voice::voice_mute,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
