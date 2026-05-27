use anyhow::Result;
use std::path::{Path, PathBuf};

use crate::models::InstalledAddon;

/// Resolve the default ESO AddOns folder for the current OS.
///
/// Windows: `~/Documents/Elder Scrolls Online/live/AddOns`
/// Linux (Steam Proton/Steam Deck):
///   `~/.local/share/Steam/steamapps/compatdata/306130/pfx/drive_c/users/steamuser/Documents/Elder Scrolls Online/live/AddOns`
pub fn default_addons_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        dirs::document_dir().map(|d| d.join("Elder Scrolls Online").join("live").join("AddOns"))
    }
    #[cfg(target_os = "linux")]
    {
        dirs::data_dir().map(|d| {
            d.join("Steam")
                .join("steamapps")
                .join("compatdata")
                .join("306130")
                .join("pfx")
                .join("drive_c")
                .join("users")
                .join("steamuser")
                .join("Documents")
                .join("Elder Scrolls Online")
                .join("live")
                .join("AddOns")
        })
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        dirs::document_dir().map(|d| d.join("Elder Scrolls Online").join("live").join("AddOns"))
    }
}

/// Directories the ESO client itself drops inside `AddOns/` as part of
/// translation packs (and similar). Minion treats them as belonging to the
/// addon that shipped them — one catalog entry, one row in the UI. We do
/// the same by hiding them from the installed list. They're rooted by the
/// catalog row's directory list, not by their own manifest.
fn is_aux_client_dir(name: &str) -> bool {
    matches!(name, "gamedata" | "EsoUI" | "fonts" | "lang")
}

pub fn scan(addons_dir: &Path) -> Result<Vec<InstalledAddon>> {
    if !addons_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(addons_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if dir_name.starts_with('.') {
            continue;
        }
        if is_aux_client_dir(&dir_name) {
            continue;
        }
        let dir_path = entry.path();
        let manifest = locate_manifest(&dir_path, &dir_name);
        let mut addon = match manifest {
            Some(p) => parse_manifest(&p, &dir_name).unwrap_or_else(|_| empty(&dir_name)),
            None => empty(&dir_name),
        };
        addon.dir_name = dir_name;
        out.push(addon);
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}

fn locate_manifest(dir: &Path, name: &str) -> Option<PathBuf> {
    let txt = dir.join(format!("{}.txt", name));
    if txt.exists() {
        return Some(txt);
    }
    let addon = dir.join(format!("{}.addon", name));
    if addon.exists() {
        return Some(addon);
    }
    None
}

fn empty(dir_name: &str) -> InstalledAddon {
    InstalledAddon {
        dir_name: dir_name.to_string(),
        title: dir_name.to_string(),
        version: None,
        author: None,
        description: None,
        depends_on: vec![],
        optional_depends_on: vec![],
        catalog_id: None,
        catalog_version: None,
        category_id: None,
        thumbnail_url: None,
        update_available: false,
        catalog_last_updated: None,
        installed_at: None,
    }
}

fn parse_manifest(path: &Path, fallback_name: &str) -> Result<InstalledAddon> {
    let content = read_lossy(path)?;
    let mut title: Option<String> = None;
    let mut version: Option<String> = None;
    let mut author: Option<String> = None;
    let mut description: Option<String> = None;
    let mut depends_on: Vec<String> = Vec::new();
    let mut optional_depends_on: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if !line.starts_with("##") {
            continue;
        }
        let body = line.trim_start_matches('#').trim();
        let (key, value) = match body.split_once(':') {
            Some(parts) => (parts.0.trim(), parts.1.trim()),
            None => continue,
        };
        match key {
            "Title" => title = Some(strip_color_codes(value)),
            "Version" => version = Some(value.to_string()),
            "Author" => author = Some(strip_color_codes(value)),
            "Description" => description = Some(strip_color_codes(value)),
            "DependsOn" | "PCDependsOn" | "Dependencies" => {
                depends_on.extend(parse_dep_list(value));
            }
            "OptionalDependsOn" => {
                optional_depends_on.extend(parse_dep_list(value));
            }
            _ => {}
        }
    }

    Ok(InstalledAddon {
        dir_name: fallback_name.to_string(),
        title: title.unwrap_or_else(|| fallback_name.to_string()),
        version,
        author,
        description,
        depends_on,
        optional_depends_on,
        catalog_id: None,
        catalog_version: None,
        category_id: None,
        thumbnail_url: None,
        update_available: false,
        catalog_last_updated: None,
        installed_at: None,
    })
}

fn read_lossy(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn parse_dep_list(value: &str) -> Vec<String> {
    value
        .split_whitespace()
        .map(|tok| {
            // Strip version constraints like "LibFoo>=1.2" or "LibBar<2.0"
            tok.split(|c: char| c == '>' || c == '<' || c == '=')
                .next()
                .unwrap_or(tok)
                .trim()
                .to_string()
        })
        .filter(|s| !s.is_empty())
        .collect()
}

fn strip_color_codes(s: &str) -> String {
    // ESO color codes look like |cRRGGBB ... |r
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'|' && (bytes[i + 1] == b'c' || bytes[i + 1] == b'C')
        {
            i += 2 + 6; // skip "|c" and 6 hex digits
            if i > bytes.len() {
                break;
            }
            continue;
        }
        if i + 1 < bytes.len() && bytes[i] == b'|' && (bytes[i + 1] == b'r' || bytes[i + 1] == b'R')
        {
            i += 2;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out.trim().to_string()
}
