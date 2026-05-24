use anyhow::{anyhow, Result};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

const CLOSE_TO_TRAY_KEY: &str = "close_to_tray";
const AUTO_UPDATE_INTERVAL_KEY: &str = "auto_update_interval_minutes";

use crate::api::MmouiClient;
use crate::db;
use crate::models::CatalogMeta;
use crate::scanner;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub addons_dir: Mutex<PathBuf>,
    pub backups_dir: PathBuf,
    pub mmoui: MmouiClient,
    pub syncing: AtomicBool,
    pub close_to_tray: AtomicBool,
    pub auto_update_interval_minutes: AtomicU64,
}

const ADDONS_DIR_KEY: &str = "addons_dir_override";

impl AppState {
    pub fn init() -> Result<Self> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| anyhow!("could not resolve user data directory"))?
            .join("Apocrypha");
        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("catalog.db");
        let conn = db::open(&db_path)?;
        // Prefer a previously persisted override; fall back to the OS-default
        // (Documents/Elder Scrolls Online/live/AddOns, OneDrive-aware on Windows).
        let addons_dir = db::get_metadata(&conn, ADDONS_DIR_KEY)
            .map(PathBuf::from)
            .or_else(scanner::default_addons_dir)
            .unwrap_or_else(|| data_dir.join("addons_placeholder"));
        let backups_dir = data_dir.join("backups");
        std::fs::create_dir_all(&backups_dir)?;
        let close_to_tray = db::get_metadata(&conn, CLOSE_TO_TRAY_KEY)
            .map(|v| v == "true")
            .unwrap_or(false);
        let auto_update_interval = db::get_metadata(&conn, AUTO_UPDATE_INTERVAL_KEY)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        Ok(Self {
            db: Mutex::new(conn),
            addons_dir: Mutex::new(addons_dir),
            backups_dir,
            mmoui: MmouiClient::new(),
            syncing: AtomicBool::new(false),
            close_to_tray: AtomicBool::new(close_to_tray),
            auto_update_interval_minutes: AtomicU64::new(auto_update_interval),
        })
    }

    pub fn persist_addons_dir(&self, path: &str) -> Result<()> {
        let conn = self.db.lock().unwrap();
        db::set_metadata(&conn, ADDONS_DIR_KEY, path)
    }

    pub fn set_close_to_tray(&self, value: bool) -> Result<()> {
        self.close_to_tray.store(value, Ordering::SeqCst);
        let conn = self.db.lock().unwrap();
        db::set_metadata(&conn, CLOSE_TO_TRAY_KEY, if value { "true" } else { "false" })
    }

    pub fn close_to_tray_enabled(&self) -> bool {
        self.close_to_tray.load(Ordering::SeqCst)
    }

    pub fn set_auto_update_interval(&self, minutes: u64) -> Result<()> {
        self.auto_update_interval_minutes
            .store(minutes, Ordering::SeqCst);
        let conn = self.db.lock().unwrap();
        db::set_metadata(&conn, AUTO_UPDATE_INTERVAL_KEY, &minutes.to_string())
    }

    pub fn auto_update_interval(&self) -> u64 {
        self.auto_update_interval_minutes.load(Ordering::SeqCst)
    }

    pub async fn run_sync(&self) -> Result<CatalogMeta> {
        if self.syncing.swap(true, Ordering::SeqCst) {
            return Err(anyhow!("sync already in progress"));
        }
        let _guard = SyncGuard(&self.syncing);

        let addons = self.mmoui.fetch_addons().await?;
        let categories = self.mmoui.fetch_categories().await?;

        let meta = {
            let mut conn = self.db.lock().unwrap();
            db::upsert_categories(&mut conn, &categories)?;
            db::upsert_addons(&mut conn, &addons)?;
            db::catalog_meta(&conn)?
        };
        Ok(meta)
    }
}

struct SyncGuard<'a>(&'a AtomicBool);

impl<'a> Drop for SyncGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
