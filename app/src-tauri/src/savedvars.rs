use anyhow::{anyhow, Result};
use chrono::Utc;
use std::path::{Path, PathBuf};

use crate::models::Snapshot;

/// Resolve the ESO SavedVariables folder from the configured AddOns dir.
/// Both live as siblings inside `live/`:
///   live/AddOns/
///   live/SavedVariables/
pub fn savedvars_dir_for(addons_dir: &Path) -> Option<PathBuf> {
    addons_dir.parent().map(|p| p.join("SavedVariables"))
}

const TRIGGER_DELIM: &str = "__";

fn now_id(kind: &str) -> String {
    let ts = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    format!("{}_{}", ts, kind)
}

fn parse_id(id: &str) -> Option<(String, String)> {
    // "2026-05-23_14-32-15_manual" → (created_at_rfc3339, kind)
    // The kind is everything after the third '_'.
    let mut parts = id.splitn(3, '_');
    let date = parts.next()?;
    let time = parts.next()?;
    let rest = parts.next()?;
    // rest may include an optional "__<trigger>" tail.
    let kind = rest.split(TRIGGER_DELIM).next()?;
    // Reformat the timestamp to an ISO string for the frontend.
    let time = time.replace('-', ":");
    let iso = format!("{}T{}Z", date, time);
    Some((iso, kind.to_string()))
}

fn parse_trigger(id: &str) -> Option<String> {
    id.splitn(4, '_')
        .last()
        .and_then(|tail| tail.split_once(TRIGGER_DELIM))
        .map(|(_, t)| t.to_string())
}

fn measure(path: &Path) -> (u32, u64) {
    let mut count = 0u32;
    let mut size = 0u64;
    if let Ok(rd) = std::fs::read_dir(path) {
        for entry in rd.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    count += 1;
                    size += meta.len();
                }
            }
        }
    }
    (count, size)
}

fn snapshot_from_dir(path: &Path) -> Option<Snapshot> {
    let id = path.file_name()?.to_string_lossy().to_string();
    let (created_at, kind) = parse_id(&id)?;
    let trigger = parse_trigger(&id);
    let (file_count, total_size_bytes) = measure(path);
    Some(Snapshot {
        id,
        created_at,
        kind,
        file_count,
        total_size_bytes,
        trigger,
    })
}

pub fn list(backups_dir: &Path) -> Result<Vec<Snapshot>> {
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(backups_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if let Some(snap) = snapshot_from_dir(&entry.path()) {
            out.push(snap);
        }
    }
    // newest first
    out.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(out)
}

/// Copy every file (not subdirs) from `savedvars_dir` into a new timestamped
/// folder under `backups_dir`. Returns the metadata of the created snapshot.
pub fn create(
    backups_dir: &Path,
    savedvars_dir: &Path,
    kind: &str,
    trigger: Option<&str>,
) -> Result<Snapshot> {
    if !savedvars_dir.exists() {
        return Err(anyhow!("SavedVariables folder does not exist"));
    }
    let mut id = now_id(kind);
    if let Some(t) = trigger {
        id.push_str(TRIGGER_DELIM);
        id.push_str(t);
    }
    let target = backups_dir.join(&id);
    std::fs::create_dir_all(&target)?;

    let mut file_count = 0u32;
    let mut total_size = 0u64;
    for entry in std::fs::read_dir(savedvars_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let dest = target.join(entry.file_name());
        let bytes = std::fs::copy(entry.path(), &dest)?;
        file_count += 1;
        total_size += bytes;
    }

    if file_count == 0 {
        // No files captured — clean up the empty snapshot folder.
        let _ = std::fs::remove_dir_all(&target);
        return Err(anyhow!("SavedVariables folder is empty"));
    }

    let (created_at, kind_parsed) = parse_id(&id).unwrap_or_else(|| (
        Utc::now().to_rfc3339(),
        kind.to_string(),
    ));

    Ok(Snapshot {
        id,
        created_at,
        kind: kind_parsed,
        file_count,
        total_size_bytes: total_size,
        trigger: trigger.map(String::from),
    })
}

fn snapshot_path(backups_dir: &Path, id: &str) -> Result<PathBuf> {
    if id.contains('/') || id.contains('\\') || id.contains("..") || id.is_empty() {
        return Err(anyhow!("invalid snapshot id"));
    }
    Ok(backups_dir.join(id))
}

pub fn restore(backups_dir: &Path, id: &str, savedvars_dir: &Path) -> Result<u32> {
    let source = snapshot_path(backups_dir, id)?;
    if !source.exists() || !source.is_dir() {
        return Err(anyhow!("snapshot not found"));
    }
    std::fs::create_dir_all(savedvars_dir)?;

    let mut restored = 0u32;
    for entry in std::fs::read_dir(&source)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let dest = savedvars_dir.join(entry.file_name());
        std::fs::copy(entry.path(), &dest)?;
        restored += 1;
    }
    Ok(restored)
}

pub fn delete(backups_dir: &Path, id: &str) -> Result<()> {
    let target = snapshot_path(backups_dir, id)?;
    if !target.exists() {
        return Err(anyhow!("snapshot not found"));
    }
    // Canonicalize and ensure it's inside backups_dir.
    let canon_root = backups_dir.canonicalize()?;
    let canon_target = target.canonicalize()?;
    if !canon_target.starts_with(&canon_root) {
        return Err(anyhow!("snapshot escapes backups folder"));
    }
    std::fs::remove_dir_all(&canon_target)?;
    Ok(())
}
