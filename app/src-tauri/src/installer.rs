use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
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

/// Outcome of unpacking a single zip.
struct ExtractResult {
    /// Root dirs that are addon folders (had a `<Dir>/<Dir>.txt` or `.addon`).
    /// Extracted under `addons_dir`. These are what the scanner/UI consider installed.
    addon_dirs: Vec<String>,
    /// File paths (relative to `live_dir`) for non-addon roots like
    /// `gamedata/lang/br.lang` or `EsoUI/lang/br_*.str`. Tracked so uninstall
    /// can remove the exact files this addon dropped outside `AddOns/`.
    client_files: Vec<PathBuf>,
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
    for d in &extracted.addon_dirs {
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
    //
    // Also persist `installed_dir:{dir}` → catalog_id for every addon root we
    // just dropped. Two catalog rows can declare the same directory (the
    // EsoBR / ESOBR Reforged case) — without this mapping the UI guesses
    // which one owns it via `find_by_directory`, which is non-deterministic
    // and flags the wrong addon as "installed".
    {
        let conn = state.db.lock().unwrap();
        if let Ok(Some(addon)) = db::find_by_id(&conn, &addon_id) {
            let key = format!("installed:{}", addon.id);
            let _ = db::set_metadata(&conn, &key, &addon.last_updated.to_string());
            let at_key = format!("installed_at:{}", addon.id);
            let _ = db::set_metadata(&conn, &at_key, &Utc::now().to_rfc3339());

            for dir in &extracted.addon_dirs {
                let dir_key = format!("installed_dir:{}", dir);
                let _ = db::set_metadata(&conn, &dir_key, &addon.id);
            }

            if !extracted.client_files.is_empty() {
                let rels: Vec<String> = extracted
                    .client_files
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if let Ok(json) = serde_json::to_string(&rels) {
                    let cf_key = format!("client_files:{}", addon.id);
                    let _ = db::set_metadata(&conn, &cf_key, &json);
                }
            }
        }
    }

    let deps = collect_dependencies(&addons_dir, &extracted.addon_dirs)?;
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

/// Return `live_dir` (the parent of `live/AddOns/`) when `addons_dir` looks
/// like the standard ESO layout. Returns `None` if the user pointed the
/// AddOns folder somewhere custom — in that case we can't safely place
/// client overrides (`gamedata/`, `EsoUI/`) so they're skipped.
/// Root dir names that are packaging garbage (Finder leftovers, etc) and
/// should never be extracted anywhere. About 19 catalog entries currently
/// ship a `__MACOSX/` next to their real addon.
fn is_noise_root(name: &str) -> bool {
    matches!(name, "__MACOSX" | ".DS_Store")
}

fn derive_live_dir(addons_dir: &Path) -> Option<PathBuf> {
    let last = addons_dir.file_name()?.to_str()?;
    if !last.eq_ignore_ascii_case("AddOns") {
        return None;
    }
    addons_dir.parent().map(|p| p.to_path_buf())
}

fn extract_zip(bytes: &[u8], addons_dir: &Path) -> Result<ExtractResult> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    // Pass 1: collect root dirs, mark which ones contain a manifest, and
    // validate every entry's path.
    let mut root_dirs: HashSet<String> = HashSet::new();
    let mut root_has_manifest: HashMap<String, bool> = HashMap::new();
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
        let root_name = match rel.components().next() {
            Some(Component::Normal(s)) => s.to_str().map(String::from),
            _ => None,
        };
        if let Some(name) = root_name.as_deref() {
            if !name.is_empty() {
                root_dirs.insert(name.to_string());
                // The manifest convention is `<root>/<root>.txt` or `.addon`
                // sitting directly under the root dir.
                if rel.components().count() == 2 && !file.is_dir() {
                    if let Some(fname) = rel.file_name().and_then(|n| n.to_str()) {
                        let txt = format!("{}.txt", name);
                        let addon_ext = format!("{}.addon", name);
                        if fname == txt || fname == addon_ext {
                            root_has_manifest.insert(name.to_string(), true);
                        }
                    }
                }
            }
        }
        safe_entries.push((i, rel));
    }

    // Split roots into addon vs client-override buckets. A handful of
    // well-known noise dirs (macOS Finder droppings) are dropped outright —
    // they have no manifest, but they also don't belong under `live/`.
    let mut addon_root_set: HashSet<String> = HashSet::new();
    let mut override_root_set: HashSet<String> = HashSet::new();
    for name in &root_dirs {
        if is_noise_root(name) {
            continue;
        }
        if *root_has_manifest.get(name).unwrap_or(&false) {
            addon_root_set.insert(name.clone());
        } else {
            override_root_set.insert(name.clone());
        }
    }

    let live_dir = derive_live_dir(addons_dir);
    if !override_root_set.is_empty() && live_dir.is_none() {
        eprintln!(
            "warning: addons_dir is not 'AddOns/' — skipping non-addon roots that need to live alongside it: {:?}",
            override_root_set
        );
    }

    // Pre-clean each addon root so orphan files from previous versions
    // (e.g. old `Addon.txt` when the new release ships `Addon.addon`) don't linger.
    // SavedVariables live outside the AddOns folder, so this is safe.
    //
    // Override roots like `gamedata/` and `EsoUI/` are intentionally NOT
    // pre-cleaned: they're shared with the game client and may hold
    // translations from other languages or addons. We just overwrite the
    // specific files this zip ships.
    let canon_addons = addons_dir.canonicalize()?;
    for name in &addon_root_set {
        let target = addons_dir.join(name);
        if !target.exists() || !target.is_dir() {
            continue;
        }
        let canon_target = match target.canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        if canon_target.starts_with(&canon_addons) {
            let _ = std::fs::remove_dir_all(&canon_target);
        }
    }

    let canon_live = live_dir
        .as_ref()
        .and_then(|p| p.canonicalize().ok());

    // Migration: previous Apocrypha builds extracted override roots
    // (`gamedata/`, `EsoUI/`) inside `AddOns/` because the installer didn't
    // distinguish them. Now that we know they belong in `live/`, sweep any
    // ghost copies sitting in `AddOns/` so the user doesn't end up with two
    // sets of files. Only does anything when we successfully resolved
    // `live_dir` — otherwise we leave whatever is there alone.
    if canon_live.is_some() {
        for name in &override_root_set {
            let ghost = addons_dir.join(name);
            if !ghost.is_dir() {
                continue;
            }
            if let Ok(canon_ghost) = ghost.canonicalize() {
                if canon_ghost.starts_with(&canon_addons) {
                    let _ = std::fs::remove_dir_all(&canon_ghost);
                }
            }
        }
    }

    // Pass 2: actually extract. Each entry is routed to either `addons_dir`
    // or `live_dir` based on which bucket its root falls into.
    let mut client_files: Vec<PathBuf> = Vec::new();
    for (i, rel) in safe_entries {
        let root = match rel.components().next() {
            Some(Component::Normal(s)) => match s.to_str() {
                Some(name) => name.to_string(),
                None => continue,
            },
            _ => continue,
        };

        let (dest_base, expected_canon, is_override) = if addon_root_set.contains(&root) {
            (addons_dir, &canon_addons, false)
        } else if override_root_set.contains(&root) {
            match (live_dir.as_deref(), canon_live.as_ref()) {
                (Some(d), Some(c)) => (d, c, true),
                _ => continue, // can't safely place, already warned above
            }
        } else {
            continue;
        };

        let mut file = archive.by_index(i)?;
        let outpath = dest_base.join(&rel);

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
            // Defense in depth: confirm the realized parent is inside the
            // expected destination. Symlinks or odd canonicalization shouldn't
            // let us write outside `addons_dir` / `live_dir`.
            match parent.canonicalize() {
                Ok(canon_parent) => {
                    if !canon_parent.starts_with(expected_canon) {
                        eprintln!("skipping path escape attempt: {:?}", outpath);
                        continue;
                    }
                }
                Err(_) => continue,
            }
        }

        let mut outfile = std::fs::File::create(&outpath)?;
        std::io::copy(&mut file, &mut outfile)?;

        if is_override {
            client_files.push(rel.clone());
        }
    }

    Ok(ExtractResult {
        addon_dirs: addon_root_set.into_iter().collect(),
        client_files,
    })
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

/// Clear the install markers we wrote during the most recent install of this
/// addon. Used by the uninstall path so a future re-install starts fresh
/// instead of inheriting the previous marker.
pub fn clear_install_marker(state: &AppState, catalog_id: &str, dir_name: &str) {
    let conn = state.db.lock().unwrap();
    let _ = db::set_metadata(&conn, &format!("installed:{}", catalog_id), "");
    let _ = db::set_metadata(&conn, &format!("installed_at:{}", catalog_id), "");
    let _ = db::set_metadata(&conn, &format!("installed_dir:{}", dir_name), "");
    let _ = db::set_metadata(&conn, &format!("client_files:{}", catalog_id), "");
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

/// Remove the client override files that an addon previously dropped under
/// `live/` (outside `AddOns/`). `files` are paths relative to `live_dir`.
///
/// After removing each file we try to prune now-empty parent directories,
/// but stop at `live_dir` itself and at any directory that still has siblings
/// — those likely belong to another addon or to the game client.
pub fn uninstall_client_files(live_dir: &Path, files: &[PathBuf]) {
    let canon_live = match live_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return,
    };

    for rel in files {
        // Reject any relative path that tries to escape.
        if rel.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        }) {
            continue;
        }

        let full = live_dir.join(rel);
        let canon_full = match full.canonicalize() {
            Ok(p) => p,
            Err(_) => continue, // already gone
        };
        if !canon_full.starts_with(&canon_live) {
            continue;
        }
        let _ = std::fs::remove_file(&canon_full);

        // Walk up, pruning empty dirs until we hit live_dir or a non-empty one.
        let mut cursor = canon_full.parent().map(|p| p.to_path_buf());
        while let Some(dir) = cursor {
            if dir == canon_live {
                break;
            }
            if !dir.starts_with(&canon_live) {
                break;
            }
            if std::fs::remove_dir(&dir).is_err() {
                // Either not empty or permission denied — stop walking up.
                break;
            }
            cursor = dir.parent().map(|p| p.to_path_buf());
        }
    }
}

/// Read the list of client-override paths recorded for `catalog_id`, or
/// empty if none were tracked.
pub fn client_files_for(state: &AppState, catalog_id: &str) -> Vec<PathBuf> {
    let key = format!("client_files:{}", catalog_id);
    let raw = {
        let conn = state.db.lock().unwrap();
        db::get_metadata(&conn, &key)
    };
    let Some(json) = raw else { return Vec::new() };
    if json.is_empty() {
        return Vec::new();
    }
    serde_json::from_str::<Vec<String>>(&json)
        .map(|v| v.into_iter().map(PathBuf::from).collect())
        .unwrap_or_default()
}

pub fn live_dir_for(addons_dir: &Path) -> Option<PathBuf> {
    derive_live_dir(addons_dir)
}
