//! Motor do Papinho. Não conhece a UI: fala com ela só por comandos e
//! eventos (ver `ipc.rs`).

pub mod chat;
pub mod error;
pub mod ipc;
pub mod skills;

pub use error::{EngineError, Result};

/// PATH ampliado pra spawn de comandos — o app GUI herda um PATH mínimo do
/// Finder (sem /opt/homebrew/bin, /usr/local/bin).
pub fn shell_path() -> String {
    let extra = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    match std::env::var("PATH") {
        Ok(base) if !base.is_empty() => format!("{base}:{extra}"),
        _ => extra.to_string(),
    }
}
