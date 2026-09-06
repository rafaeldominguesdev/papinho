//! Motor do Papinho. Não conhece a UI: fala com ela só por comandos e
//! eventos (ver `ipc.rs`).

pub mod chat;
pub mod diag;
pub mod error;
pub mod ipc;
mod neural;
pub mod providers;
pub mod skills;
pub mod tts;
pub mod voice;

pub use error::{EngineError, Result};

/// PATH ampliado pra spawn de comandos — o app GUI herda um PATH mínimo do
/// Finder (sem /opt/homebrew/bin, sem ~/.local/bin). As CLIs de IA são
/// instaladas de mil jeitos (npm -g, curl, bun), então a fonte confiável é o
/// PATH do shell de login de quem usa; os diretórios fixos são a rede de
/// segurança pra quando o shell não responde. Calculado uma vez só.
pub fn shell_path() -> String {
    static PATH: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    PATH.get_or_init(|| {
        let mut dirs: Vec<String> = Vec::new();
        for source in [
            std::env::var("PATH").unwrap_or_default(),
            login_shell_path(),
            fallback_path(),
        ] {
            for dir in source.split(':').filter(|d| !d.is_empty()) {
                if !dirs.iter().any(|seen| seen == dir) {
                    dirs.push(dir.to_string());
                }
            }
        }
        dirs.join(":")
    })
    .clone()
}

/// Pergunta o PATH ao shell de login. `printenv` em vez de `echo $PATH`
/// porque no fish o $PATH é uma lista e sairia separado por espaço.
fn login_shell_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    std::process::Command::new(shell)
        .args(["-lc", "printenv PATH"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .unwrap_or_default()
}

fn fallback_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{home}/.local/bin:{home}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")
}

#[cfg(test)]
mod tests {
    /// O usuário pode ter as CLIs em ~/.local/bin e um shell de login que não
    /// exporta esse diretório (config do fish com $SHELL=zsh, por exemplo) —
    /// a rede de segurança tem que cobrir isso.
    #[test]
    fn shell_path_sempre_inclui_o_local_bin_do_usuario() {
        let home = std::env::var("HOME").expect("HOME");
        let esperado = format!("{home}/.local/bin");
        let path = super::shell_path();
        assert!(
            path.split(':').any(|dir| dir == esperado),
            "PATH ampliado sem {esperado}: {path}"
        );
    }
}
