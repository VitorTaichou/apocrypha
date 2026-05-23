mod api;
mod commands;
mod db;
mod installer;
mod models;
mod savedvars;
mod scanner;
mod state;

use state::AppState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::init().expect("failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app_state)
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
                let _ = handle.emit("catalog:sync:start", ());
                match state.run_sync().await {
                    Ok(meta) => {
                        let _ = handle.emit("catalog:sync:done", &meta);
                    }
                    Err(e) => {
                        let _ = handle.emit("catalog:sync:error", e.to_string());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_addons,
            commands::list_categories,
            commands::catalog_meta,
            commands::list_installed,
            commands::sync_catalog,
            commands::get_addons_dir,
            commands::set_addons_dir,
            commands::install_addon,
            commands::uninstall_addon,
            commands::get_addon_by_id,
            commands::get_addon_details,
            commands::list_savedvars_snapshots,
            commands::create_savedvars_snapshot,
            commands::restore_savedvars_snapshot,
            commands::delete_savedvars_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
