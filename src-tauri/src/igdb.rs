use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::net::http_client;

const PAGE_SIZE: i64 = 47;
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const GAMES_URL: &str = "https://api.igdb.com/v4/games";
const COUNT_URL: &str = "https://api.igdb.com/v4/games/count";
const COVER_BASE: &str = "https://images.igdb.com/igdb/image/upload/t_cover_big";

const LIST_FIELDS: &str =
    "fields id, name, cover.image_id, rating, rating_count, first_release_date, summary, videos.video_id, platforms.abbreviation, platforms.name;";
const DETAIL_FIELDS: &str =
    "fields id, name, cover.image_id, rating, rating_count, first_release_date, summary, videos.video_id, platforms.abbreviation, platforms.name;";

struct CachedToken {
    access_token: String,
    expires_at: Instant,
}

fn token_slot() -> &'static Mutex<Option<CachedToken>> {
    static SLOT: OnceLock<Mutex<Option<CachedToken>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn env_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        out.push(cwd.join(".env"));
        if let Some(parent) = cwd.parent() {
            out.push(parent.join(".env"));
        }
    }
    out.push(PathBuf::from("../.env"));
    out.push(PathBuf::from(".env"));
    out
}

fn load_dotenv() {
    static LOADED: OnceLock<()> = OnceLock::new();
    LOADED.get_or_init(|| {
        for path in env_paths() {
            let Ok(text) = fs::read_to_string(&path) else {
                continue;
            };
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                let Some((key, value)) = line.split_once('=') else {
                    continue;
                };
                let key = key.trim();
                if key.is_empty() {
                    continue;
                }
                let value = value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string();
                if std::env::var_os(key).is_none() {
                    std::env::set_var(key, value);
                }
            }
            break;
        }
    });
}

fn twitch_creds() -> Result<(String, String), String> {
    load_dotenv();
    let id = std::env::var("TWITCH_CLIENT_ID")
        .unwrap_or_default()
        .trim()
        .to_string();
    let secret = std::env::var("TWITCH_CLIENT_SECRET")
        .unwrap_or_default()
        .trim()
        .to_string();
    if id.is_empty() || secret.is_empty() {
        return Err(
            "Twitch IGDB is not configured. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env, then restart DARKE.".into(),
        );
    }
    Ok((id, secret))
}

#[tauri::command]
pub fn igdb_configured() -> bool {
    twitch_creds().is_ok()
}

#[derive(Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
    expires_in: Option<u64>,
}

async fn access_token() -> Result<(String, String), String> {
    let (client_id, client_secret) = twitch_creds()?;
    {
        let guard = token_slot().lock().await;
        if let Some(cached) = guard.as_ref() {
            if Instant::now() < cached.expires_at {
                return Ok((client_id, cached.access_token.clone()));
            }
        }
    }
    let response = http_client()?
        .post(TOKEN_URL)
        .query(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| format!("Twitch token request failed: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Twitch token body: {e}"))?;
    if !status.is_success() {
        return Err(format!("Twitch rejected credentials (HTTP {status})."));
    }
    let parsed: TwitchTokenResponse = serde_json::from_str(&text)
        .map_err(|_| "Twitch token response was not JSON.".to_string())?;
    let ttl = parsed.expires_in.unwrap_or(3600).saturating_sub(60).max(30);
    {
        let mut guard = token_slot().lock().await;
        *guard = Some(CachedToken {
            access_token: parsed.access_token.clone(),
            expires_at: Instant::now() + Duration::from_secs(ttl),
        });
    }
    Ok((client_id, parsed.access_token))
}

async fn igdb_post(url: &str, body: &str) -> Result<Value, String> {
    let (client_id, token) = access_token().await?;
    let response = http_client()?
        .post(url)
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .header("Content-Type", "text/plain")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("IGDB request failed: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("IGDB body: {e}"))?;
    if status.as_u16() == 401 {
        let mut guard = token_slot().lock().await;
        *guard = None;
        return Err("IGDB rejected the Twitch token. Restart DARKE and try again.".into());
    }
    if !status.is_success() {
        return Err(format!("IGDB HTTP {status}"));
    }
    serde_json::from_str(&text).map_err(|_| "IGDB returned invalid JSON.".to_string())
}

fn sanitize_search(raw: &str) -> String {
    raw.chars()
        .filter(|c| *c != '"' && *c != '\\')
        .collect::<String>()
        .trim()
        .chars()
        .take(80)
        .collect()
}

fn is_trending(genre: &str) -> bool {
    genre.is_empty() || genre == "trending" || genre == "all"
}

fn category_where(genre: &str) -> String {
    let extra = match genre {
        "cyberpunk" => "keywords = (121)",
        "shooter" => "genres = (5)",
        "action-adv" => "genres = (31)",
        "horror" => "themes = (19)",
        "sci-fi" => "themes = (18)",
        "roguelike" => "keywords = (1256)",
        "sim" => "genres = (13)",
        "indie" => "genres = (32)",
        _ => "",
    };
    // IGDB retired `category` in favor of `game_type` (same numeric ids).
    // Filtering on category now matches nothing.
    let base = "cover != null & game_type = (0,8,9,10,11)";
    if extra.is_empty() {
        base.into()
    } else {
        format!("{base} & {extra}")
    }
}

fn sort_clause(sort: &str, searching: bool, trending: bool) -> Option<&'static str> {
    if searching {
        return None;
    }
    if trending && (sort == "newest" || sort == "all" || sort.is_empty()) {
        return Some("sort rating_count desc;");
    }
    match sort {
        "oldest" => Some("sort first_release_date asc;"),
        "top" => Some("sort rating desc;"),
        "all" => None,
        _ => Some("sort first_release_date desc;"),
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Howard Hinnant civil-to-days, midnight UTC.
fn civil_to_unix(year: i64, month: i64, day: i64) -> i64 {
    let mut y = year;
    if month <= 2 {
        y -= 1;
    }
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    days * 86400
}

fn date_filter(year: Option<i64>, searching: bool) -> String {
    if searching {
        return String::new();
    }
    let now = unix_now();
    if let Some(y) = year {
        if (1970..2100).contains(&y) {
            let start = civil_to_unix(y, 1, 1);
            let end = civil_to_unix(y + 1, 1, 1).min(now + 1).max(start + 1);
            return format!(" & first_release_date >= {start} & first_release_date < {end}");
        }
    }
    format!(" & first_release_date != null & first_release_date <= {now}")
}

fn catalog_where(genre: &str, search: &str, sort: &str, year: Option<i64>) -> String {
    let searching = !sanitize_search(search).is_empty();
    let mut where_clause = category_where(genre);
    where_clause.push_str(&date_filter(year, searching));
    if !searching && sort == "top" {
        where_clause.push_str(" & rating != null");
    }
    where_clause
}

fn catalog_query(page: i64, genre: &str, search: &str, sort: &str, year: Option<i64>) -> String {
    let offset = (page.max(1) - 1) * PAGE_SIZE;
    let q = sanitize_search(search);
    let searching = !q.is_empty();
    let where_clause = catalog_where(genre, search, sort, year);
    let mut lines = Vec::new();
    if searching {
        lines.push(format!("search \"{q}\";"));
    }
    lines.push(LIST_FIELDS.into());
    lines.push(format!("where {where_clause};"));
    if let Some(sort_line) = sort_clause(sort, searching, is_trending(genre)) {
        lines.push(sort_line.into());
    }
    lines.push(format!("limit {PAGE_SIZE};"));
    lines.push(format!("offset {offset};"));
    lines.join("\n")
}

fn fallback_query(page: i64, search: &str) -> String {
    let offset = (page.max(1) - 1) * PAGE_SIZE;
    let q = sanitize_search(search);
    let now = unix_now();
    let mut lines = Vec::new();
    if !q.is_empty() {
        lines.push(format!("search \"{q}\";"));
    }
    lines.push(LIST_FIELDS.into());
    if q.is_empty() {
        lines.push(format!(
            "where cover != null & first_release_date != null & first_release_date <= {now};"
        ));
        lines.push("sort rating_count desc;".into());
    } else {
        lines.push("where cover != null;".into());
    }
    lines.push(format!("limit {PAGE_SIZE};"));
    lines.push(format!("offset {offset};"));
    lines.join("\n")
}

fn cover_url(image_id: &str) -> Option<String> {
    let id: String = image_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if id.is_empty() {
        None
    } else {
        Some(format!("{COVER_BASE}/{id}.jpg"))
    }
}

fn map_platform(name: &str, abbr: &str) -> Option<&'static str> {
    let n = name.to_lowercase();
    let a = abbr.to_lowercase();
    if n.contains("playstation") || a.starts_with("ps") {
        return Some("PlayStation");
    }
    if n.contains("xbox") || a.contains("xbox") || a == "xone" {
        return Some("Xbox");
    }
    if n.contains("linux") || a == "linux" {
        return Some("Linux");
    }
    if n.contains("windows") || a == "pc" {
        return Some("PC");
    }
    None
}

fn as_i64(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_u64().map(|n| n as i64))
}

fn as_f64(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| as_i64(value).map(|n| n as f64))
}

fn released_date(unix: i64) -> Option<String> {
    if unix <= 0 {
        return None;
    }
    let z = unix.div_euclid(86400) + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    Some(format!("{year:04}-{m:02}-{d:02}"))
}

fn platforms_from(value: &Value) -> Vec<String> {
    let mut seen = Vec::new();
    let Some(rows) = value.as_array() else {
        return seen;
    };
    for row in rows {
        let name = row.get("name").and_then(Value::as_str).unwrap_or("");
        let abbr = row
            .get("abbreviation")
            .and_then(Value::as_str)
            .unwrap_or("");
        if let Some(label) = map_platform(name, abbr) {
            if !seen.iter().any(|s| s == label) {
                seen.push(label.to_string());
            }
        }
    }
    let order = ["PC", "PlayStation", "Xbox", "Linux"];
    order
        .into_iter()
        .filter(|p| seen.iter().any(|s| s == p))
        .map(|s| s.to_string())
        .collect()
}

fn cover_from(row: &Value) -> Option<String> {
    let cover = row.get("cover")?;
    let image_id = cover.get("image_id").and_then(Value::as_str)?;
    cover_url(image_id)
}

fn trailer_from(row: &Value) -> Option<IgdbTrailer> {
    let videos = row.get("videos")?.as_array()?;
    for video in videos {
        let id = video.get("video_id").and_then(Value::as_str).unwrap_or("");
        let trimmed = id.trim();
        if trimmed.len() == 11
            && trimmed
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return Some(IgdbTrailer::Youtube {
                id: trimmed.to_string(),
            });
        }
    }
    None
}

fn as_game(row: &Value) -> Option<IgdbGame> {
    let id = as_i64(row.get("id")?)?;
    let name = row.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    let released = row
        .get("first_release_date")
        .and_then(as_i64)
        .and_then(released_date);
    Some(IgdbGame {
        id,
        name: name.chars().take(300).collect(),
        released,
        cover_url: cover_from(row),
        rating: row.get("rating").and_then(as_f64).filter(|n| *n > 0.0),
        platforms: platforms_from(row.get("platforms").unwrap_or(&Value::Null)),
    })
}

fn as_detail(row: &Value) -> Option<IgdbGameDetail> {
    let game = as_game(row)?;
    Some(IgdbGameDetail {
        id: game.id,
        name: game.name,
        released: game.released,
        cover_url: game.cover_url,
        rating: game.rating,
        platforms: game.platforms,
        description: row
            .get("summary")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        trailer: trailer_from(row),
        requirements: None,
    })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IgdbGame {
    id: i64,
    name: String,
    released: Option<String>,
    cover_url: Option<String>,
    rating: Option<f64>,
    platforms: Vec<String>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum IgdbTrailer {
    Youtube { id: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgdbGameDetail {
    id: i64,
    name: String,
    released: Option<String>,
    cover_url: Option<String>,
    rating: Option<f64>,
    platforms: Vec<String>,
    description: Option<String>,
    trailer: Option<IgdbTrailer>,
    requirements: Option<IgdbRequirements>,
}

#[derive(Serialize)]
pub struct IgdbRequirements {
    minimum: Option<String>,
    recommended: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgdbListPage {
    items: Vec<IgdbGame>,
    page: i64,
    total_pages: i64,
}

#[tauri::command]
pub async fn igdb_games(
    page: Option<i64>,
    genre: Option<String>,
    search: Option<String>,
    sort: Option<String>,
    year: Option<i64>,
) -> Result<IgdbListPage, String> {
    let page = page.unwrap_or(1).max(1);
    let genre = genre.unwrap_or_else(|| "trending".into());
    let search = search.unwrap_or_default();
    let sort = sort.unwrap_or_else(|| "newest".into());
    let year = year.filter(|y| *y >= 1970 && *y < 2100);
    let query = catalog_query(page, &genre, &search, &sort, year);
    let mut rows = match igdb_post(GAMES_URL, &query).await {
        Ok(data) => data.as_array().cloned().unwrap_or_default(),
        Err(err) if page <= 1 => {
            let _ = err;
            Vec::new()
        }
        Err(err) => return Err(err),
    };
    if rows.is_empty() && page <= 1 {
        let data = igdb_post(GAMES_URL, &fallback_query(page, &search)).await?;
        rows = data.as_array().cloned().unwrap_or_default();
    }
    let items: Vec<IgdbGame> = rows.iter().filter_map(as_game).collect();
    let mut total_pages = if items.len() as i64 == PAGE_SIZE {
        page + 1
    } else {
        page.max(1)
    };
    let q = sanitize_search(&search);
    let where_clause = catalog_where(&genre, &search, &sort, year);
    let count_body = if !q.is_empty() {
        format!("search \"{q}\";\nwhere {where_clause};")
    } else {
        format!("where {where_clause};")
    };
    if let Ok(count_json) = igdb_post(COUNT_URL, &count_body).await {
        if let Some(count) = as_i64(count_json.get("count").unwrap_or(&Value::Null)) {
            total_pages = ((count + PAGE_SIZE - 1) / PAGE_SIZE).max(1);
        }
    }
    Ok(IgdbListPage {
        items,
        page,
        total_pages,
    })
}

#[tauri::command]
pub async fn igdb_game(id: i64) -> Result<IgdbGameDetail, String> {
    if id <= 0 {
        return Err("Invalid game id.".into());
    }
    let query = format!("{DETAIL_FIELDS}\nwhere id = {id};");
    let data = igdb_post(GAMES_URL, &query).await?;
    let row = data
        .as_array()
        .and_then(|rows| rows.first())
        .ok_or_else(|| "Game not found.".to_string())?;
    as_detail(row).ok_or_else(|| "Game not found.".to_string())
}
