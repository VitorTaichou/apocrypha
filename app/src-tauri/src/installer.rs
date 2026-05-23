use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::state::AppState;

#[derive(Serialize, Clone)]
struct InstallProgress<'a> {
    id: &'a str,
    phase: &'a str,
}

pub async fn install_addon(
    state: &AppState,
    app: &AppHandle,
    addon_id: String,
) -> Result<Vec<String>> {
    let mut visited: HashSet<String> = HashSet::new();
    let mut installed_dirs: Vec<String> = Vec::new();
    install_one(state, app, addon_id, &mut visited, &mut installed_dirs).await?;
    Ok(installed_dirs)
}

async fn install_one(
    state: &AppState,
    app: &AppHandle,
    addon_id: String,
    visited: &mut HashSet<String>,
    installed_dirs: &mut Vec<String>,
) -> Result<()> {
    if !visited.insert(addon_id.clone()) {
        return Ok(());
    }

    let _ = app.emit(
        "addon:install:progress",
        InstallProgress {
            id: &addon_id,
            phase: "fetching",
        },
    );

    let url = state
        .mmoui
        .fetch_addon_download_url(&addon_id)
        .await?
        .ok_or_else(|| anyhow!("no download URL for addon {}", addon_id))?;

    let _ = app.emit(
        "addon:install:progress",
        InstallProgress {
            id: &addon_id,
            phase: "downloading",
        },
    );

    let bytes = state.mmoui.download_bytes(&url).await?;

    let _ = app.emit(
        "addon:install:progress",
        InstallProgress {
            id: &addon_id,
            phase: "extracting",
        },
    );

    let addons_dir = state.addons_dir.lock().unwrap().clone();
    std::fs::create_dir_all(&addons_dir)?;
    let extracted = extract_zip(&bytes, &addons_dir)?;
    for d in &extracted {
        if !installed_dirs.contains(d) {
            installed_dirs.push(d.clone());
        }
    }

    // Resolve dependencies (DependsOn / PCDependsOn / Dependencies — required, not optional)
    let _ = app.emit(
        "addon:install:progress",
        InstallProgress {
            id: &addon_id,
            phase: "dependencies",
        },
    );

    // Record the catalog timestamp we just landed on. The next scan compares
    // this marker against the addon's current catalog.last_updated — useful
    // when an author bumps the ESOUI submission but forgets to bump the
    // `## Version:` line inside the manifest, which would otherwise leave the
    // row stuck on "Update available" forever.
    {
        let conn = state.db.lock().unwrap();
        if let Ok(Some(addon)) = db::find_by_id(&conn, &addon_id) {
            let key = format!("installed:{}", addon.id);
            let _ = db::set_metadata(&conn, &key, &addon.last_updated.to_string());
        }
    }

    let deps = collect_dependencies(&addons_dir, &extracted)?;
    for dep_dir in deps {
        let dep_path = addons_dir.join(&dep_dir);
        if dep_path.exists() {
            continue;
        }
        let dep_id = {
            let conn = state.db.lock().unwrap();
            db::find_by_directory(&conn, &dep_dir)?.map(|a| a.id)
        };
        if let Some(id) = dep_id {
            Box::pin(install_one(state, app, id, visited, installed_dirs)).await?;
        } else {
            eprintln!("dependency '{}' not in catalog — skipping", dep_dir);
        }
    }

    Ok(())
}

fn extract_zip(bytes: &[u8], addons_dir: &Path) -> Result<Vec<String>> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    // Pass 1: collect root dirs and validate entries.
    let mut root_dirs: HashSet<String> = HashSet::new();
    let mut safe_entries: Vec<(usize, PathBuf)> = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let file = archive.by_index(i)?;
        let raw_name = file.name().to_string();

        // enclosed_name() rejects paths with `..` or absolute prefixes — primary defense.
        let rel = match file.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => {
                eprintln!("skipping suspicious zip entry: {}", raw_name);
                continue;
            }
        };
        // Belt-and-suspenders: reject any parent/root components.
        if rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::Prefix(_) | Component::RootDir))
        {
            eprintln!("skipping unsafe zip entry: {}", raw_name);
            continue;
        }
        if let Some(Component::Normal(s)) = rel.components().next() {
            if let Some(name) = s.to_str() {
                if !name.is_empty() {
                    root_dirs.insert(name.to_string());
                }
            }
        }
        safe_entries.push((i, rel));
    }

    // Pre-clean each root dir so orphan files from previous versions
    // (e.g. old `Addon.txt` when the new release ships `Addon.addon`) don't linger.
    // SavedVariables live outside the AddOns folder, so this is safe.
    let canon_addons = addons_dir.canonicalize()?;
    for name in &root_dirs {
        let target = addons_dir.join(name);
        if !target.exists() || !target.is_dir() {
            continue;
        }
        // Canonicalize and confirm it's actually inside addons_dir before removing.
        let canon_target = match target.canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        if canon_target.starts_with(&canon_addons) {
            let _ = std::fs::remove_dir_all(&canon_target);
        }
    }

    // Pass 2: actually extract.
    for (i, rel) in safe_entries {
        let mut file = archive.by_index(i)?;
        let outpath = addons_dir.join(&rel);
        if file.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }

    Ok(root_dirs.into_iter().collect())
}

fn collect_dependencies(addons_dir: &Path, dirs: &[String]) -> Result<Vec<String>> {
    use std::collections::HashSet as Set;
    let mut deps: Set<String> = Set::new();

    for dir in dirs {
        let manifest_txt = addons_dir.join(dir).join(format!("{}.txt", dir));
        let manifest_addon = addons_dir.join(dir).join(format!("{}.addon", dir));
        let path = if manifest_txt.exists() {
            manifest_txt
        } else if manifest_addon.exists() {
            manifest_addon
        } else {
            continue;
        };

        let content = match std::fs::read(&path) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
            Err(_) => continue,
        };

        for raw_line in content.lines() {
            let line = raw_line.trim();
            if !(line.starts_with("## DependsOn:")
                || line.starts_with("## PCDependsOn:")
                || line.starts_with("## Dependencies:"))
            {
                continue;
            }
            let value = line.split_once(':').map(|(_, v)| v.trim()).unwrap_or("");
            for tok in value.split_whitespace() {
                let clean = tok
                    .split(|c: char| c == '>' || c == '<' || c == '=')
                    .next()
                    .unwrap_or(tok)
                    .trim();
                if !clean.is_empty() {
                    deps.insert(clean.to_string());
                }
            }
        }
    }
    Ok(deps.into_iter().collect())
}

/// Clear the install marker we wrote during the most recent install of this
/// addon. Used by the uninstall path so a future re-install starts fresh
/// instead of inheriting the previous marker.
pub fn clear_install_marker(state: &AppState, catalog_id: &str) {
    let conn = state.db.lock().unwrap();
    let key = format!("installed:{}", catalog_id);
    let _ = db::set_metadata(&conn, &key, "");
}

pub fn uninstall(addons_dir: &Path, dir_name: &str) -> Result<PathBuf> {
    // Defense in depth: the command layer also validates, but never trust callers.
    if dir_name.is_empty()
        || dir_name.contains('/')
        || dir_name.contains('\\')
        || dir_name.contains("..")
    {
        return Err(anyhow!("invalid addon directory name"));
    }
    let target = addons_dir.join(dir_name);
    if !target.exists() {
        return Err(anyhow!("addon directory not found"));
    }
    if !target.is_dir() {
        return Err(anyhow!("target is not a directory"));
    }
    // Canonicalize and verify the target is inside addons_dir.
    let canon_addons = addons_dir.canonicalize()?;
    let canon_target = target.canonicalize()?;
    if !canon_target.starts_with(&canon_addons) {
        return Err(anyhow!("target escapes addons folder"));
    }
    std::fs::remove_dir_all(&canon_target)?;
    Ok(canon_target)
}
