use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

use crate::db;
use crate::installer;
use crate::models::{Addon, AddonDetails, CatalogMeta, InstalledAddon, SearchResult, Snapshot};
use crate::savedvars;
use crate::scanner;
use crate::state::AppState;

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
    let dir = state.addons_dir.lock().unwrap().clone();
    let mut installed = scanner::scan(&dir).map_err(map_err)?;

    // Enrich with catalog data — match by directory or name
    let conn = state.db.lock().unwrap();
    struct CatalogMatch {
        id: String,
        version: String,
        category_id: Option<String>,
        thumbnail_url: Option<String>,
    }
    let mut catalog_map: HashMap<String, CatalogMatch> = HashMap::new();
    for a in installed.iter() {
        if catalog_map.contains_key(&a.dir_name) {
            continue;
        }
        if let Ok(Some(addon)) = db::find_by_directory(&conn, &a.dir_name) {
            catalog_map.insert(
                a.dir_name.clone(),
                CatalogMatch {
                    id: addon.id,
                    version: addon.version,
                    category_id: addon.category_id,
                    thumbnail_url: addon.thumbnail_url,
                },
            );
        }
    }
    drop(conn);

    for a in installed.iter_mut() {
        if let Some(m) = catalog_map.get(&a.dir_name) {
            a.catalog_id = Some(m.id.clone());
            a.catalog_version = Some(m.version.clone());
            a.category_id = m.category_id.clone();
            a.thumbnail_url = m.thumbnail_url.clone();
            a.update_available = match a.version.as_deref() {
                Some(local) => normalize_version(local) != normalize_version(&m.version),
                None => false,
            };
        }
    }

    Ok(installed)
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
    let addons_dir = state.addons_dir.lock().unwrap().clone();
    match installer::uninstall(&addons_dir, &dir_name) {
        Ok(_) => {
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
