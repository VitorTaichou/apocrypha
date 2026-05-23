use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Addon {
    pub id: String,
    pub category_id: Option<String>,
    pub name: String,
    pub author: String,
    pub version: String,
    pub last_updated: i64,
    pub download_total: i64,
    pub download_monthly: i64,
    pub favorite_total: i64,
    pub directories: Vec<String>,
    pub file_info_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub file_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledAddon {
    pub dir_name: String,
    pub title: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub depends_on: Vec<String>,
    pub optional_depends_on: Vec<String>,
    pub catalog_id: Option<String>,
    pub catalog_version: Option<String>,
    pub category_id: Option<String>,
    pub thumbnail_url: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogMeta {
    pub addon_count: i64,
    pub last_synced: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub total: i64,
    pub page: u32,
    pub limit: u32,
    pub addons: Vec<Addon>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonDetails {
    #[serde(flatten)]
    pub addon: Addon,
    pub description: String,
    pub changelog: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub created_at: String,
    pub kind: String,
    pub file_count: u32,
    pub total_size_bytes: u64,
    pub trigger: Option<String>,
}
