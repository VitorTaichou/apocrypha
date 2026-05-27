use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::Path;

use crate::models::{Addon, CatalogMeta, Category, SearchResult};

pub fn open(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    create_schema(&conn)?;
    Ok(conn)
}

fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT,
            file_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS addons (
            id TEXT PRIMARY KEY,
            category_id TEXT,
            name TEXT NOT NULL,
            author TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '',
            last_updated INTEGER NOT NULL DEFAULT 0,
            download_total INTEGER NOT NULL DEFAULT 0,
            download_monthly INTEGER NOT NULL DEFAULT 0,
            favorite_total INTEGER NOT NULL DEFAULT 0,
            directories TEXT NOT NULL DEFAULT '',
            file_info_url TEXT,
            thumbnail_url TEXT,
            images TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_addons_name ON addons(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_addons_category ON addons(category_id);
        CREATE INDEX IF NOT EXISTS idx_addons_downloads ON addons(download_total DESC);
        CREATE INDEX IF NOT EXISTS idx_addons_directories ON addons(directories);

        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    // Idempotent migrations for users coming from older DB versions.
    let _ = conn.execute("ALTER TABLE addons ADD COLUMN thumbnail_url TEXT", []);
    let _ = conn.execute("ALTER TABLE addons ADD COLUMN images TEXT", []);
    Ok(())
}

pub fn upsert_addons(conn: &mut Connection, addons: &[Addon]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO addons (id, category_id, name, author, version, last_updated,
                download_total, download_monthly, favorite_total, directories, file_info_url,
                thumbnail_url, images)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                category_id = excluded.category_id,
                name = excluded.name,
                author = excluded.author,
                version = excluded.version,
                last_updated = excluded.last_updated,
                download_total = excluded.download_total,
                download_monthly = excluded.download_monthly,
                favorite_total = excluded.favorite_total,
                directories = excluded.directories,
                file_info_url = excluded.file_info_url,
                thumbnail_url = excluded.thumbnail_url,
                images = excluded.images
            "#,
        )?;
        for a in addons {
            let images_json = serde_json::to_string(&a.images).unwrap_or_else(|_| "[]".into());
            stmt.execute(params![
                a.id,
                a.category_id,
                a.name,
                a.author,
                a.version,
                a.last_updated,
                a.download_total,
                a.download_monthly,
                a.favorite_total,
                a.directories.join(","),
                a.file_info_url,
                a.thumbnail_url,
                images_json,
            ])?;
        }
    }
    tx.execute(
        "INSERT INTO metadata (key, value) VALUES ('last_synced', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![Utc::now().to_rfc3339()],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn upsert_categories(conn: &mut Connection, cats: &[Category]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO categories (id, title, icon, file_count)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                icon = excluded.icon,
                file_count = excluded.file_count
            "#,
        )?;
        for c in cats {
            stmt.execute(params![c.id, c.title, c.icon, c.file_count])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn search(
    conn: &Connection,
    query: Option<&str>,
    category_id: Option<&str>,
    sort_by: Option<&str>,
    page: u32,
    limit: u32,
) -> Result<SearchResult> {
    let mut where_parts: Vec<String> = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(q) = query.filter(|s| !s.trim().is_empty()) {
        where_parts.push("(name LIKE ?1 OR author LIKE ?1)".into());
        params_vec.push(format!("%{}%", q));
    }
    if let Some(c) = category_id.filter(|s| !s.is_empty()) {
        let idx = params_vec.len() + 1;
        where_parts.push(format!("category_id = ?{}", idx));
        params_vec.push(c.to_string());
    }

    let where_clause = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM addons {}", where_clause);
    let total: i64 = conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(params_vec.iter()),
        |r| r.get(0),
    )?;

    // Whitelist sort columns — anything else falls back to download_total.
    // Inlining is safe because we never interpolate user input here.
    let order_by = match sort_by.unwrap_or("download_total") {
        "name" => "name COLLATE NOCASE ASC",
        "last_updated" => "last_updated DESC",
        "favorite_total" => "favorite_total DESC",
        "download_monthly" => "download_monthly DESC",
        _ => "download_total DESC",
    };

    let offset = ((page.saturating_sub(1)) * limit) as i64;
    let list_sql = format!(
        "SELECT id, category_id, name, author, version, last_updated,
                download_total, download_monthly, favorite_total, directories, file_info_url,
                thumbnail_url, images
         FROM addons {}
         ORDER BY {}
         LIMIT ?{} OFFSET ?{}",
        where_clause,
        order_by,
        params_vec.len() + 1,
        params_vec.len() + 2
    );

    let limit_str = limit.to_string();
    let offset_str = offset.to_string();
    let mut all_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();
    all_params.push(&limit_str);
    all_params.push(&offset_str);

    let mut stmt = conn.prepare(&list_sql)?;
    let rows = stmt.query_map(all_params.as_slice(), row_to_addon)?;
    let mut addons = Vec::new();
    for row in rows {
        addons.push(row?);
    }

    Ok(SearchResult {
        total,
        page,
        limit,
        addons,
    })
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Addon>> {
    let mut stmt = conn.prepare(
        "SELECT id, category_id, name, author, version, last_updated,
                download_total, download_monthly, favorite_total, directories, file_info_url,
                thumbnail_url, images
         FROM addons WHERE id = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_addon(row)?))
    } else {
        Ok(None)
    }
}

pub fn find_by_directory(conn: &Connection, dir_name: &str) -> Result<Option<Addon>> {
    let pattern = format!("%,{},%", dir_name);
    let mut stmt = conn.prepare(
        "SELECT id, category_id, name, author, version, last_updated,
                download_total, download_monthly, favorite_total, directories, file_info_url,
                thumbnail_url, images
         FROM addons
         WHERE ',' || directories || ',' LIKE ?1
            OR name = ?2
         LIMIT 1",
    )?;
    let mut rows = stmt.query(params![pattern, dir_name])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_addon(row)?))
    } else {
        Ok(None)
    }
}

/// Like `find_by_directory` but returns every catalog row that declares the
/// given directory. Used to detect fork-successor cases where two catalog
/// entries ship the same directory (e.g. an abandoned original and a
/// maintained re-upload) and the more recent one should supersede.
pub fn find_all_by_directory(conn: &Connection, dir_name: &str) -> Result<Vec<Addon>> {
    let pattern = format!("%,{},%", dir_name);
    let mut stmt = conn.prepare(
        "SELECT id, category_id, name, author, version, last_updated,
                download_total, download_monthly, favorite_total, directories, file_info_url,
                thumbnail_url, images
         FROM addons
         WHERE ',' || directories || ',' LIKE ?1
            OR name = ?2",
    )?;
    let rows = stmt.query_map(params![pattern, dir_name], row_to_addon)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn categories(conn: &Connection) -> Result<Vec<Category>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, icon, file_count FROM categories
         WHERE file_count > 0
         ORDER BY file_count DESC, title ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Category {
            id: r.get(0)?,
            title: r.get(1)?,
            icon: r.get(2)?,
            file_count: r.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get_metadata(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM metadata WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .ok()
}

pub fn set_metadata(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO metadata (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn catalog_meta(conn: &Connection) -> Result<CatalogMeta> {
    let addon_count: i64 = conn.query_row("SELECT COUNT(*) FROM addons", [], |r| r.get(0))?;
    let last_synced: Option<String> = conn
        .query_row(
            "SELECT value FROM metadata WHERE key = 'last_synced'",
            [],
            |r| r.get(0),
        )
        .ok();
    Ok(CatalogMeta {
        addon_count,
        last_synced,
    })
}

fn row_to_addon(row: &rusqlite::Row) -> rusqlite::Result<Addon> {
    let dirs_csv: String = row.get(9)?;
    let directories: Vec<String> = if dirs_csv.is_empty() {
        vec![]
    } else {
        dirs_csv.split(',').map(String::from).collect()
    };
    let images_json: Option<String> = row.get(12).ok();
    let images: Vec<String> = images_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    Ok(Addon {
        id: row.get(0)?,
        category_id: row.get(1)?,
        name: row.get(2)?,
        author: row.get(3)?,
        version: row.get(4)?,
        last_updated: row.get(5)?,
        download_total: row.get(6)?,
        download_monthly: row.get(7)?,
        favorite_total: row.get(8)?,
        directories,
        file_info_url: row.get(10)?,
        thumbnail_url: row.get(11).ok(),
        images,
    })
}
