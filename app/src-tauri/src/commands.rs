use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

use crate::db;
use crate::installer;
use crate::models::{Addon, AddonDetails, CatalogMeta, InstalledAddon, SearchResult, Snapshot};
use crate::savedvars;
use crate::scanner;
use crate::state::AppState;

/// Scan the AddOns folder and cross-reference catalog data. Public so the
/// background auto-update task can reuse the same logic as the Tauri command.
pub fn enumerate_installed(state: &AppState) -> anyhow::Result<Vec<InstalledAddon>> {
    let dir = state.addons_dir.lock().unwrap().clone();
    let mut installed = scanner::scan(&dir)?;

    struct CatalogMatch {
        id: String,
        version: String,
        last_updated: i64,
        category_id: Option<String>,
        thumbnail_url: Option<String>,
    }
    let mut catalog_map: HashMap<String, CatalogMatch> = HashMap::new();
    let mut install_markers: HashMap<String, i64> = HashMap::new();
    let mut install_timestamps: HashMap<String, String> = HashMap::new();
    {
        let conn = state.db.lock().unwrap();
        for a in installed.iter() {
            if catalog_map.contains_key(&a.dir_name) {
                continue;
            }
            // Prefer the explicit `installed_dir:{dir}` → catalog_id mapping
            // recorded at install time. It disambiguates the case where two
            // catalog rows declare the same directory (e.g. EsoBR 2256 and
            // the obsolete Reforged 4541 both ship `EsoBR_Reforged/`).
            // Fall back to `find_by_directory` for legacy installs and for
            // addons placed manually by the user.
            let pinned_id = db::get_metadata(&conn, &format!("installed_dir:{}", a.dir_name))
                .filter(|s| !s.is_empty());
            let resolved = match pinned_id {
                Some(id) => db::find_by_id(&conn, &id).ok().flatten(),
                None => db::find_by_directory(&conn, &a.dir_name).ok().flatten(),
            };
            if let Some(addon) = resolved {
                if let Some(marker) =
                    db::get_metadata(&conn, &format!("installed:{}", addon.id))
                {
                    if let Ok(n) = marker.parse::<i64>() {
                        install_markers.insert(addon.id.clone(), n);
                    }
                }
                if let Some(at) =
                    db::get_metadata(&conn, &format!("installed_at:{}", addon.id))
                {
                    if !at.is_empty() {
                        install_timestamps.insert(addon.id.clone(), at);
                    }
                }
                catalog_map.insert(
                    a.dir_name.clone(),
                    CatalogMatch {
                        id: addon.id,
                        version: addon.version,
                        last_updated: addon.last_updated,
                        category_id: addon.category_id,
                        thumbnail_url: addon.thumbnail_url,
                    },
                );
            }
        }
    }

    for a in installed.iter_mut() {
        if let Some(m) = catalog_map.get(&a.dir_name) {
            a.catalog_id = Some(m.id.clone());
            a.catalog_version = Some(m.version.clone());
            a.category_id = m.category_id.clone();
            a.thumbnail_url = m.thumbnail_url.clone();
            a.catalog_last_updated = if m.last_updated > 0 { Some(m.last_updated) } else { None };
            a.installed_at = install_timestamps.get(&m.id).cloned();

            // Decide "up to date" depending on what we know about this addon:
            //
            // - If we have a marker (= we installed it ourselves), trust ONLY
            //   the marker. Compare the catalog's last_updated against the
            //   timestamp we recorded at install time. Catches the case where
            //   an author re-publishes on ESOUI without bumping the manifest
            //   string — Minion flags those as updatable, and so should we.
            //
            // - If we don't have a marker (addon was placed manually / by
            //   another manager), fall back to string equality on the version
            //   line. Best we can do without an install timestamp of our own.
            //
            // Older builds stored UIDate in milliseconds; new builds store
            // unix-seconds. Normalize both sides so we compare apples-to-apples
            // even if the marker was written by a previous version.
            let normalize = |t: i64| if t > 100_000_000_000 { t / 1000 } else { t };
            let marker = install_markers.get(&m.id).copied().unwrap_or(0);
            let has_marker = marker > 0;
            a.update_available = if has_marker {
                normalize(marker) != normalize(m.last_updated)
            } else {
                match a.version.as_deref() {
                    Some(local) => normalize_version(local) != normalize_version(&m.version),
                    None => true,
                }
            };
        }
    }

    Ok(installed)
}

type CmdResult<T> = Result<T, String>;

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn get_addons_dir(state: State<'_, AppState>) -> CmdResult<String> {
    Ok(state.addons_dir.lock().unwrap().to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_addons_dir(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let p = std::path::PathBuf::from(&path);
    *state.addons_dir.lock().unwrap() = p;
    state.persist_addons_dir(&path).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn search_addons(
    state: State<'_, AppState>,
    query: Option<String>,
    category_id: Option<String>,
    sort_by: Option<String>,
    page: Option<u32>,
    limit: Option<u32>,
) -> CmdResult<SearchResult> {
    let conn = state.db.lock().unwrap();
    db::search(
        &conn,
        query.as_deref(),
        category_id.as_deref(),
        sort_by.as_deref(),
        page.unwrap_or(1),
        limit.unwrap_or(30),
    )
    .map_err(map_err)
}

#[tauri::command]
pub fn list_categories(state: State<'_, AppState>) -> CmdResult<Vec<crate::models::Category>> {
    let conn = state.db.lock().unwrap();
    db::categories(&conn).map_err(map_err)
}

#[tauri::command]
pub fn get_addon_by_id(state: State<'_, AppState>, id: String) -> CmdResult<Option<Addon>> {
    let conn = state.db.lock().unwrap();
    db::find_by_id(&conn, &id).map_err(map_err)
}

#[tauri::command]
pub async fn get_addon_details(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<Option<AddonDetails>> {
    let addon = {
        let conn = state.db.lock().unwrap();
        db::find_by_id(&conn, &id).map_err(map_err)?
    };
    let Some(addon) = addon else { return Ok(None) };
    let (description, changelog) = state
        .mmoui
        .fetch_addon_details(&id)
        .await
        .map_err(map_err)?;
    Ok(Some(AddonDetails {
        addon,
        description,
        changelog,
    }))
}

#[tauri::command]
pub fn catalog_meta(state: State<'_, AppState>) -> CmdResult<CatalogMeta> {
    let conn = state.db.lock().unwrap();
    db::catalog_meta(&conn).map_err(map_err)
}

#[tauri::command]
pub fn list_installed(state: State<'_, AppState>) -> CmdResult<Vec<InstalledAddon>> {
    enumerate_installed(state.inner()).map_err(map_err)
}

#[tauri::command]
pub async fn sync_catalog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CmdResult<CatalogMeta> {
    let _ = app.emit("catalog:sync:start", ());
    match state.run_sync().await {
        Ok(meta) => {
            let _ = app.emit("catalog:sync:done", &meta);
            Ok(meta)
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit("catalog:sync:error", &msg);
            Err(msg)
        }
    }
}

fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

#[tauri::command]
pub async fn install_addon(
    app: AppHandle,
    state: State<'_, AppState>,
    addon_id: String,
) -> CmdResult<Vec<String>> {
    let _ = app.emit("addon:install:start", &serde_json::json!({ "id": &addon_id }));
    match installer::install_addon(state.inner(), &app, addon_id.clone()).await {
        Ok(dirs) => {
            let _ = app.emit(
                "addon:install:done",
                &serde_json::json!({ "id": &addon_id, "directories": &dirs }),
            );
            Ok(dirs)
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit(
                "addon:install:error",
                &serde_json::json!({ "id": &addon_id, "error": &msg }),
            );
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn get_close_to_tray(state: State<'_, AppState>) -> CmdResult<bool> {
    Ok(state.close_to_tray_enabled())
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, AppState>, value: bool) -> CmdResult<()> {
    state.set_close_to_tray(value).map_err(map_err)
}

#[tauri::command]
pub fn get_auto_update_interval(state: State<'_, AppState>) -> CmdResult<u64> {
    Ok(state.auto_update_interval())
}

#[tauri::command]
pub fn set_auto_update_interval(state: State<'_, AppState>, minutes: u64) -> CmdResult<()> {
    state.set_auto_update_interval(minutes).map_err(map_err)
}

#[tauri::command]
pub fn list_savedvars_snapshots(state: State<'_, AppState>) -> CmdResult<Vec<Snapshot>> {
    savedvars::list(&state.backups_dir).map_err(map_err)
}

#[tauri::command]
pub fn create_savedvars_snapshot(state: State<'_, AppState>) -> CmdResult<Snapshot> {
    let addons_dir = state.addons_dir.lock().unwrap().clone();
    let sv_dir = savedvars::savedvars_dir_for(&addons_dir)
        .ok_or_else(|| "Could not derive SavedVariables path from AddOns folder".to_string())?;
    savedvars::create(&state.backups_dir, &sv_dir, "manual", None).map_err(map_err)
}

#[tauri::command]
pub fn restore_savedvars_snapshot(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<u32> {
    let addons_dir = state.addons_dir.lock().unwrap().clone();
    let sv_dir = savedvars::savedvars_dir_for(&addons_dir)
        .ok_or_else(|| "Could not derive SavedVariables path from AddOns folder".to_string())?;
    savedvars::restore(&state.backups_dir, &id, &sv_dir).map_err(map_err)
}

#[tauri::command]
pub fn delete_savedvars_snapshot(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    savedvars::delete(&state.backups_dir, &id).map_err(map_err)
}

#[tauri::command]
pub fn uninstall_addon(
    app: AppHandle,
    state: State<'_, AppState>,
    dir_name: String,
) -> CmdResult<()> {
    // Resolve catalog id: prefer the pinned mapping written at install time,
    // fall back to the directory→catalog lookup for legacy / manual installs.
    let catalog_id = {
        let conn = state.db.lock().unwrap();
        let pinned = db::get_metadata(&conn, &format!("installed_dir:{}", dir_name))
            .filter(|s| !s.is_empty());
        pinned.or_else(|| {
            db::find_by_directory(&conn, &dir_name)
                .ok()
                .flatten()
                .map(|a| a.id)
        })
    };

    let addons_dir = state.addons_dir.lock().unwrap().clone();
    match installer::uninstall(&addons_dir, &dir_name) {
        Ok(_) => {
            if let Some(id) = &catalog_id {
                installer::clear_install_marker(state.inner(), id, &dir_name);
            }
            let _ = app.emit(
                "addon:uninstall:done",
                &serde_json::json!({ "dir_name": &dir_name }),
            );
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit(
                "addon:uninstall:error",
                &serde_json::json!({ "dir_name": &dir_name, "error": &msg }),
            );
            Err(msg)
        }
    }
}
