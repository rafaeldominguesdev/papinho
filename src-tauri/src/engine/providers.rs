//! As IAs que o Papinho sabe conversar.
//!
//! Cada uma é uma CLI que já vive na máquina de quem usa — o Papinho não
//! guarda chave de API nenhuma: ele reaproveita o login que a pessoa já fez
//! (`claude`, `codex`, `gemini`, `cursor-agent`, `grok`, `agy`). Conectar uma
//! IA nova é instalar a CLI dela e logar; a tela de IAs só mostra o estado.
//!
//! Todas têm um modo "uma pergunta, uma resposta" e (menos a do Grok) sabem
//! cuspir JSON em streaming — é disso que o chat vive.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ProviderModel {
    pub id: String,
    pub label: String,
    /// o que vai no `--model` da CLI ("" = deixa a CLI escolher)
    pub arg: String,
}

#[derive(Serialize, Clone)]
pub struct Provider {
    pub id: String,
    pub company: String,
    pub product: String,
    /// binário procurado na PATH
    pub bin: String,
    /// como instalar, quando não está
    pub install: String,
    /// como logar depois de instalar
    pub login: String,
    pub free: bool,
    pub models: Vec<ProviderModel>,
    /// preenchido por `detect`: a CLI está na máquina?
    pub installed: bool,
    /// caminho encontrado (vazio quando não achou)
    pub path: String,
}

fn m(id: &str, label: &str, arg: &str) -> ProviderModel {
    ProviderModel {
        id: id.into(),
        label: label.into(),
        arg: arg.into(),
    }
}

pub fn catalog() -> Vec<Provider> {
    vec![
        Provider {
            id: "claude".into(),
            company: "Anthropic".into(),
            product: "Claude Code".into(),
            bin: "claude".into(),
            install: "npm i -g @anthropic-ai/claude-code".into(),
            login: "claude".into(),
            free: false,
            models: vec![
                m("haiku", "Haiku", "claude-haiku-4-5"),
                m("sonnet", "Sonnet", "claude-sonnet-5"),
                m("opus", "Opus", "claude-opus-5"),
                m("fable", "Fable", "claude-fable-5-1"),
            ],
            installed: false,
            path: String::new(),
        },
        Provider {
            id: "codex".into(),
            company: "OpenAI".into(),
            product: "Codex".into(),
            bin: "codex".into(),
            install: "npm i -g @openai/codex".into(),
            login: "codex login".into(),
            free: false,
            models: vec![
                m("astra", "Astra 6", "gpt-6-astra"),
                m("sol", "Sol 5.6", "gpt-5.6-sol"),
                m("terra", "Terra 5.6", "gpt-5.6-terra"),
                m("luna", "Luna 5.6", "gpt-5.6-luna"),
                m("gpt55", "GPT-5.5", "gpt-5.5"),
                m("gpt54mini", "GPT-5.4 Mini", "gpt-5.4-mini"),
            ],
            installed: false,
            path: String::new(),
        },
        Provider {
            id: "gemini".into(),
            company: "Google".into(),
            product: "Gemini CLI".into(),
            bin: "gemini".into(),
            install: "npm i -g @google/gemini-cli".into(),
            login: "gemini".into(),
            free: true,
            // a CLI escolhe o modelo sozinha ("auto"); forçar um id que a
            // conta não tem só dá erro, então não inventamos lista.
            models: vec![m("auto", "Automático", "")],
            installed: false,
            path: String::new(),
        },
        Provider {
            id: "antigravity".into(),
            company: "Google".into(),
            product: "Antigravity CLI".into(),
            bin: "agy".into(),
            install: "curl -fsSL https://antigravity.google/cli/install.sh | bash".into(),
            login: "agy".into(),
            free: true,
            // slugs de `agy models`: o nível de raciocínio já vem no nome do
            // modelo, então cada nível é uma escolha na lista.
            models: vec![
                m("flash", "Flash 3.8", "gemini-3.8-flash-medium"),
                m("flash-alto", "Flash 3.8 alto", "gemini-3.8-flash-high"),
                m("flash-baixo", "Flash 3.8 baixo", "gemini-3.8-flash-low"),
                m("pro", "Pro 3.1", "gemini-3.1-pro-high"),
                m("sonnet46", "Sonnet 4.6", "claude-sonnet-4-6"),
                m("opus46", "Opus 4.6", "claude-opus-4-6-thinking"),
                m("oss", "GPT-OSS 120B", "gpt-oss-120b-medium"),
            ],
            installed: false,
            path: String::new(),
        },
        Provider {
            id: "cursor".into(),
            company: "Cursor".into(),
            product: "Cursor Agent".into(),
            bin: "cursor-agent".into(),
            install: "curl https://cursor.com/install -fsS | bash".into(),
            login: "cursor-agent login".into(),
            free: true,
            models: vec![m("auto", "Automático", "")],
            installed: false,
            path: String::new(),
        },
        Provider {
            id: "grok".into(),
            company: "xAI".into(),
            product: "Grok CLI".into(),
            bin: "grok".into(),
            install: "npm i -g @vibe-kit/grok-cli".into(),
            login: "GROK_API_KEY no ambiente".into(),
            free: true,
            models: vec![
                m("fast", "Code Fast 1", "grok-code-fast-1"),
                m("grok4", "Grok 4", "grok-4-latest"),
            ],
            installed: false,
            path: String::new(),
        },
    ]
}

/// Procura o binário na PATH ampliada (o app GUI herda um PATH mínimo).
pub fn which(bin: &str) -> Option<String> {
    for dir in super::shell_path().split(':') {
        if dir.is_empty() {
            continue;
        }
        let p = std::path::Path::new(dir).join(bin);
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

/// Catálogo com o estado de instalação preenchido.
pub fn detect() -> Vec<Provider> {
    catalog()
        .into_iter()
        .map(|mut p| {
            if let Some(path) = which(&p.bin) {
                p.installed = true;
                p.path = path;
            }
            p
        })
        .collect()
}

pub fn find(id: &str) -> Option<Provider> {
    catalog().into_iter().find(|p| p.id == id)
}
