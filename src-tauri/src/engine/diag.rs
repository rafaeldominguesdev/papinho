//! Log de diagnóstico em arquivo — `~/Library/Logs/Papinho.log`.
//!
//! Por que existe: o modo voz depende de coisas que só quebram na máquina de
//! quem usa (permissão de microfone e de fala, locale sem suporte, dispositivo
//! de entrada ocupado). Num app empacotado não há console pra olhar, e o erro
//! na tela some junto com a janela. Cada passo do caminho da voz deixa uma
//! linha aqui, e o front manda os erros dele pelo IPC `diag_log`.

use std::fmt::Write as _;
use std::fs::OpenOptions;
use std::io::Write as _;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library/Logs/Papinho.log"))
}

/// Relógio de parede em HH:MM:SS — sem puxar a `chrono` só pra isso.
fn stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let day = secs % 86_400;
    let mut s = String::new();
    let _ = write!(
        s,
        "{:02}:{:02}:{:02}",
        day / 3600,
        (day % 3600) / 60,
        day % 60
    );
    s
}

/// Anexa uma linha ao log. Nunca falha de um jeito que atrapalhe o app.
pub fn log(tag: &str, msg: impl AsRef<str>) {
    let Some(p) = path() else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&p) {
        let _ = writeln!(f, "{} [{}] {}", stamp(), tag, msg.as_ref());
    }
}
