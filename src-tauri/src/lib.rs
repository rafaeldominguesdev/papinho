pub mod engine;

use engine::ipc;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
