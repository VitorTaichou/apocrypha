use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::Value;

use crate::models::{Addon, Category};

const GLOBAL_CONFIG_URL: &str = "https://api.mmoui.com/v3/globalconfig.json";
const GAME_ID: &str = "ESO";

#[derive(Debug, Deserialize)]
struct GlobalConfig {
    #[serde(rename = "GAMES")]
    games: Vec<GameEntry>,
}

#[derive(Debug, Deserialize)]
struct GameEntry {
    #[serde(rename = "GameID")]
    game_id: String,
    #[serde(rename = "GameConfig")]
    game_config: String,
}

#[derive(Debug, Deserialize)]
struct GameConfig {
    #[serde(rename = "APIFeeds")]
    api_feeds: ApiFeeds,
}

#[derive(Debug, Deserialize)]
struct ApiFeeds {
    #[serde(rename = "FileList")]
    file_list: String,
    #[serde(rename = "CategoryList")]
    category_list: String,
    #[serde(rename = "FileDetails")]
    file_details: String,
}

#[derive(Debug, Clone)]
pub struct MmouiClient {
    http: reqwest::Client,
    feeds: tokio::sync::OnceCell<ApiFeedUrls>,
}

#[derive(Debug, Clone)]
struct ApiFeedUrls {
    file_list: String,
    category_list: String,
    file_details: String,
}

impl MmouiClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(
                "Apocrypha/0.1 (+https://github.com/vitordanrley/apocrypha)",
            )
            .gzip(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        Self {
            http,
            feeds: tokio::sync::OnceCell::new(),
        }
    }

    async fn discover(&self) -> Result<&ApiFeedUrls> {
        self.feeds
            .get_or_try_init(|| async {
                let cfg: GlobalConfig =
                    self.http.get(GLOBAL_CONFIG_URL).send().await?.json().await?;
                let game = cfg
                    .games
                    .into_iter()
                    .find(|g| g.game_id == GAME_ID)
                    .ok_or_else(|| anyhow!("ESO game config not found"))?;
                let game_cfg: GameConfig =
                    self.http.get(&game.game_config).send().await?.json().await?;
                Ok::<_, anyhow::Error>(ApiFeedUrls {
                    file_list: game_cfg.api_feeds.file_list,
                    category_list: game_cfg.api_feeds.category_list,
                    file_details: game_cfg.api_feeds.file_details,
                })
            })
            .await
    }

    pub async fn fetch_addons(&self) -> Result<Vec<Addon>> {
        let feeds = self.discover().await?;
        let raw: Vec<Value> = self.http.get(&feeds.file_list).send().await?.json().await?;
        let mut addons = Vec::with_capacity(raw.len());
        for v in raw {
            if let Some(a) = parse_addon(&v) {
                addons.push(a);
            }
        }
        Ok(addons)
    }

    pub async fn fetch_categories(&self) -> Result<Vec<Category>> {
        let feeds = self.discover().await?;
        let raw: Vec<Value> = self
            .http
            .get(&feeds.category_list)
            .send()
            .await?
            .json()
            .await?;
        Ok(raw.iter().filter_map(parse_category).collect())
    }

    pub async fn fetch_addon_download_url(&self, addon_id: &str) -> Result<Option<String>> {
        let feeds = self.discover().await?;
        let url = format!("{}{}.json", feeds.file_details, addon_id);
        let raw: Vec<Value> = self.http.get(&url).send().await?.json().await?;
        Ok(raw
            .first()
            .and_then(|v| v.get("UIDownload"))
            .and_then(|v| v.as_str())
            .map(String::from))
    }

    pub async fn fetch_addon_details(
        &self,
        addon_id: &str,
    ) -> Result<(String, String)> {
        let feeds = self.discover().await?;
        let url = format!("{}{}.json", feeds.file_details, addon_id);
        let raw: Vec<Value> = self.http.get(&url).send().await?.json().await?;
        let entry = raw.first();
        let description = entry
            .and_then(|v| v.get("UIDescription"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let changelog = entry
            .and_then(|v| v.get("UIChangeLog"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        Ok((description, changelog))
    }

    pub async fn download_bytes(&self, url: &str) -> Result<Vec<u8>> {
        let resp = self.http.get(url).send().await?.error_for_status()?;
        let bytes = resp.bytes().await?;
        Ok(bytes.to_vec())
    }
}

fn parse_addon(v: &Value) -> Option<Addon> {
    let id = v.get("UID").and_then(|x| x.as_str())?.to_string();
    let name = v
        .get("UIName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let author = v
        .get("UIAuthorName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let version = v
        .get("UIVersion")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let last_updated = as_i64(v.get("UIDate"));
    let download_total = as_i64(v.get("UIDownloadTotal"));
    let download_monthly = as_i64(v.get("UIDownloadMonthly"));
    let favorite_total = as_i64(v.get("UIFavoriteTotal"));
    let category_id = v
        .get("UICATID")
        .and_then(|x| x.as_str())
        .map(String::from);
    let directories: Vec<String> = match v.get("UIDir") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|d| d.as_str().map(String::from))
            .collect(),
        Some(Value::String(s)) => vec![s.clone()],
        _ => vec![],
    };
    let file_info_url = v
        .get("UIFileInfoURL")
        .and_then(|x| x.as_str())
        .map(String::from);
    let thumbs = string_array(v.get("UIIMG_Thumbs"));
    let images = string_array(v.get("UIIMGs"));
    let thumbnail_url = thumbs.into_iter().next();

    Some(Addon {
        id,
        category_id,
        name,
        author,
        version,
        last_updated,
        download_total,
        download_monthly,
        favorite_total,
        directories,
        file_info_url,
        thumbnail_url,
        images,
    })
}

fn string_array(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|x| x.as_str().map(String::from))
            .filter(|s| !s.is_empty())
            .collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}

fn parse_category(v: &Value) -> Option<Category> {
    let id = v.get("UICATID").and_then(|x| x.as_str())?.to_string();
    let title = v
        .get("UICATTitle")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let icon = v
        .get("UICATICON")
        .and_then(|x| x.as_str())
        .map(String::from);
    let file_count = as_i64(v.get("UICATFileCount"));
    Some(Category {
        id,
        title,
        icon,
        file_count,
    })
}

fn as_i64(v: Option<&Value>) -> i64 {
    match v {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.replace(',', "").parse().unwrap_or(0),
        _ => 0,
    }
}
