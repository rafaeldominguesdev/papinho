//! Ler e instalar skills do Claude Code em `~/.claude/skills/`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use super::error::{EngineError, Result};

#[derive(Debug, Serialize)]
pub struct InstalledSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    /// mtime da pasta da skill, em segundos desde a época (pra "última
    /// atualização" na UI). None se não der pra ler.
    pub modified: Option<u64>,
}

fn dir_mtime(p: &Path) -> Option<u64> {
    fs::metadata(p)
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

fn home() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| EngineError::Other("sem HOME".into()))
}

fn skills_dir() -> Result<PathBuf> {
    Ok(home()?.join(".claude").join("skills"))
}

/// Frontmatter YAML mínimo: `name:` e `description:` entre as duas linhas `---`.
fn parse_front(md: &str) -> (Option<String>, Option<String>) {
    let mut lines = md.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None);
    }
    let (mut name, mut desc) = (None, None);
    for line in lines {
        let t = line.trim();
        if t == "---" {
            break;
        }
        if let Some(v) = t.strip_prefix("name:") {
            name = Some(v.trim().trim_matches('"').to_string());
        } else if let Some(v) = t.strip_prefix("description:") {
            desc = Some(v.trim().trim_matches('"').to_string());
        }
    }
    (name, desc)
}

pub fn list_installed() -> Result<Vec<InstalledSkill>> {
    let dir = skills_dir()?;
    let mut out = Vec::new();
    let rd = match fs::read_dir(&dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(out),
    };
    for entry in rd.flatten() {
        let p = entry.path();
        let md = p.join("SKILL.md");
        if !md.is_file() {
            continue;
        }
        let text = fs::read_to_string(&md).unwrap_or_default();
        let (name, desc) = parse_front(&text);
        let name = name.unwrap_or_else(|| {
            p.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("skill")
                .to_string()
        });
        out.push(InstalledSkill {
            name,
            description: desc.unwrap_or_default(),
            modified: dir_mtime(&p),
            path: p.to_string_lossy().to_string(),
        });
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    Ok(out)
}

fn slug_ok(s: &str) -> bool {
    !s.is_empty()
        && s.len() < 64
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Instala uma skill copiando `subdir` de `repo` (git) pra `~/.claude/skills/<name>`.
/// `subdir` vazio => clona o repo inteiro como a skill.
pub fn install(repo: &str, subdir: &str, name: &str) -> Result<InstalledSkill> {
    if !slug_ok(name) {
        return Err(EngineError::Other("nome de skill inválido".into()));
    }
    if !(repo.starts_with("https://") && repo.contains("github.com")) {
        return Err(EngineError::Other(
            "repo precisa ser https://github.com/...".into(),
        ));
    }
    if subdir.contains("..") || subdir.starts_with('/') {
        return Err(EngineError::Other("subdir inválido".into()));
    }

    let dir = skills_dir()?;
    fs::create_dir_all(&dir)?;
    let target = dir.join(name);
    if target.exists() {
        return Err(EngineError::Other(format!("{name} já está instalada")));
    }

    let tmp = std::env::temp_dir().join(format!("devterm-skill-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let tmp_str = tmp
        .to_str()
        .ok_or_else(|| EngineError::Other("tmp path inválido".into()))?;

    let path_env = crate::engine::shell_path();
    let run = |args: &[&str], cwd: Option<&Path>| -> Result<()> {
        let mut c = Command::new("git");
        c.args(args).env("PATH", &path_env);
        if let Some(d) = cwd {
            c.current_dir(d);
        }
        let out = c
            .output()
            .map_err(|e| EngineError::Other(format!("git não rodou: {e}")))?;
        if !out.status.success() {
            return Err(EngineError::Other(format!(
                "git {}: {}",
                args.join(" "),
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        Ok(())
    };

    let result = (|| -> Result<()> {
        if subdir.is_empty() {
            run(&["clone", "--depth", "1", repo, tmp_str], None)?;
            let _ = fs::remove_dir_all(tmp.join(".git"));
            if !tmp.join("SKILL.md").is_file() {
                return Err(EngineError::Other("o repo não tem SKILL.md na raiz".into()));
            }
            copy_dir(&tmp, &target)?;
        } else {
            run(
                &[
                    "clone",
                    "--depth",
                    "1",
                    "--filter=blob:none",
                    "--sparse",
                    repo,
                    tmp_str,
                ],
                None,
            )?;
            run(&["sparse-checkout", "set", subdir], Some(&tmp))?;
            let src = tmp.join(subdir);
            if !src.join("SKILL.md").is_file() {
                return Err(EngineError::Other("não achei SKILL.md nesse subdir".into()));
            }
            copy_dir(&src, &target)?;
        }
        Ok(())
    })();
    let _ = fs::remove_dir_all(&tmp);
    result?;

    let text = fs::read_to_string(target.join("SKILL.md")).unwrap_or_default();
    let (n, d) = parse_front(&text);
    Ok(InstalledSkill {
        name: n.unwrap_or_else(|| name.to_string()),
        description: d.unwrap_or_default(),
        modified: dir_mtime(&target),
        path: target.to_string_lossy().to_string(),
    })
}

fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        if entry.file_name() == ".git" {
            continue;
        }
        let ft = entry.file_type()?;
        let dst = to.join(entry.file_name());
        if ft.is_dir() {
            copy_dir(&entry.path(), &dst)?;
        } else if ft.is_file() {
            fs::copy(entry.path(), &dst)?;
        }
    }
    Ok(())
}

/// Remove `~/.claude/skills/<name>`. Recusa nomes fora do padrão slug.
pub fn remove(name: &str) -> Result<()> {
    if !slug_ok(name) {
        return Err(EngineError::Other("nome inválido".into()));
    }
    let target = skills_dir()?.join(name);
    if !target.join("SKILL.md").is_file() {
        return Err(EngineError::Other("skill não encontrada".into()));
    }
    fs::remove_dir_all(&target)?;
    Ok(())
}
