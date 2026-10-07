use std::sync::OnceLock;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DarkeFetchResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

pub(crate) fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let mut default_headers = HeaderMap::new();
    default_headers.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        ),
    );
    let built = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(60))
        .default_headers(default_headers)
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    let _ = CLIENT.set(built);
    Ok(CLIENT.get().expect("reqwest client"))
}

fn assert_allowed_host(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("bad url: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    let path = parsed.path();
    if host.ends_with(".supabase.co") || host == "supabase.co" {
        return Ok(());
    }
    if (host == "www.googleapis.com" || host == "googleapis.com")
        && path.starts_with("/books/v1/")
    {
        return Ok(());
    }
    Err(format!("blocked host: {host}"))
}

/// Native HTTP via reqwest (Windows TLS). Supabase plus Google Books volumes.
/// Pass either UTF-8 `body` or binary `body_base64` (e.g. Storage uploads) — not both.
#[tauri::command]
pub async fn darke_fetch(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    body_base64: Option<String>,
) -> Result<DarkeFetchResponse, String> {
    assert_allowed_host(&url)?;

    let method: Method = method
        .parse()
        .map_err(|_| format!("bad method: {method}"))?;

    let mut header_map = HeaderMap::new();
    for (key, value) in &headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("bad header name: {key}"))?;
        let val = HeaderValue::from_str(value)
            .map_err(|_| format!("bad header value for {key}"))?;
        header_map.append(name, val);
    }

    let mut builder = http_client()?.request(method, &url).headers(header_map);
    if let Some(b64) = body_base64 {
        let bytes = STANDARD
            .decode(b64.as_bytes())
            .map_err(|e| format!("bad body_base64: {e}"))?;
        builder = builder.body(bytes);
    } else if let Some(body) = body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response
        .text()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    Ok(DarkeFetchResponse {
        status,
        headers,
        body,
    })
}

const FAVICON_MAX_BYTES: usize = 200_000;
const COVER_MAX_BYTES: usize = 800_000;

fn book_cover_host_ok(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h == "books.google.com"
        || h.ends_with(".books.google.com")
        || h.ends_with(".googleusercontent.com")
        || h == "googleusercontent.com"
        || (h.starts_with("encrypted-tbn") && h.ends_with(".gstatic.com"))
}

fn mime_from_bytes_and_type(bytes: &[u8], content_type: Option<&str>) -> Option<&'static str> {
    if let Some(ct) = content_type {
        let lower = ct.to_ascii_lowercase();
        if lower.contains("image/png") {
            return Some("image/png");
        }
        if lower.contains("image/jpeg") || lower.contains("image/jpg") {
            return Some("image/jpeg");
        }
        if lower.contains("image/gif") {
            return Some("image/gif");
        }
        if lower.contains("image/webp") {
            return Some("image/webp");
        }
        if lower.contains("image/svg") {
            return Some("image/svg+xml");
        }
        if lower.contains("image/x-icon")
            || lower.contains("image/vnd.microsoft.icon")
            || lower.contains("image/ico")
        {
            return Some("image/x-icon");
        }
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF8") {
        return Some("image/gif");
    }
    if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) || bytes.starts_with(&[0x00, 0x00, 0x02, 0x00])
    {
        return Some("image/x-icon");
    }
    if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        return Some("image/svg+xml");
    }
    None
}

async fn try_favicon_url(url: &str) -> Option<String> {
    let response = http_client().ok()?.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = response.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > FAVICON_MAX_BYTES {
        return None;
    }
    // Reject obvious HTML error pages.
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(64)]).to_ascii_lowercase();
    if head.contains("<!doctype") || head.contains("<html") {
        return None;
    }
    let mime = mime_from_bytes_and_type(&bytes, content_type.as_deref())?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

/// Fetch a site favicon (icon only — never a page screenshot). Returns a data URL or null.
#[tauri::command]
pub async fn fetch_favicon(page_url: String) -> Result<Option<String>, String> {
    let parsed = url::Url::parse(&page_url).map_err(|e| format!("bad url: {e}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Ok(None);
    }
    let host = match parsed.host_str() {
        Some(h) if !h.is_empty() => h.to_string(),
        _ => return Ok(None),
    };
    let origin = parsed.origin().ascii_serialization();

    let candidates = [
        format!("{origin}/favicon.ico"),
        format!("{origin}/favicon.png"),
        format!("https://icons.duckduckgo.com/ip3/{host}.ico"),
        format!("https://www.google.com/s2/favicons?domain={host}&sz=128"),
    ];

    for url in candidates {
        if let Some(data) = try_favicon_url(&url).await {
            return Ok(Some(data));
        }
    }
    Ok(None)
}

fn cover_gate() -> &'static tokio::sync::Semaphore {
    static GATE: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
    GATE.get_or_init(|| tokio::sync::Semaphore::new(2))
}

fn cover_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(25))
        .pool_max_idle_per_host(2)
        .build()
        .map_err(|e| format!("cover client: {e}"))?;
    let _ = CLIENT.set(built);
    Ok(CLIENT.get().expect("cover client"))
}

fn jpeg_size(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }
    let mut i = 2usize;
    while i + 8 < data.len() {
        if data[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = data[i + 1];
        if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) {
            i += 2;
            continue;
        }
        if i + 3 >= data.len() {
            return None;
        }
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        if (0xC0..=0xC3).contains(&marker) {
            if i + 8 >= data.len() {
                return None;
            }
            let h = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
            let w = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
            return Some((w, h));
        }
        if len < 2 {
            return None;
        }
        i += 2 + len;
    }
    None
}

fn png_size(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 24 || !data.starts_with(&[0x89, b'P', b'N', b'G']) {
        return None;
    }
    let w = u32::from_be_bytes(data[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(data[20..24].try_into().ok()?);
    Some((w, h))
}

fn cover_dims_ok(bytes: &[u8], mime: &str) -> bool {
    let dims = match mime {
        "image/jpeg" => jpeg_size(bytes),
        "image/png" => png_size(bytes),
        "image/webp" => Some((80, 120)),
        _ => None,
    };
    match dims {
        Some((w, h)) => w >= 40 && h >= 40,
        None => bytes.len() >= 8000,
    }
}

fn cover_candidates(image_url: Option<String>, volume_id: Option<String>) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |u: String| {
        if !u.is_empty() && !out.iter().any(|x| x == &u) {
            out.push(u);
        }
    };
    if let Some(raw) = image_url {
        let t = raw.trim();
        if !t.is_empty() {
            push(t.to_string());
        }
    }
    if let Some(id) = volume_id {
        let id = id.trim();
        if !id.is_empty() {
            let enc: String = url::form_urlencoded::byte_serialize(id.as_bytes()).collect();
            push(format!(
                "https://books.google.com/books/content?id={enc}&printsec=frontcover&img=1&zoom=1"
            ));
            push(format!(
                "https://books.google.com/books/content?id={enc}&printsec=frontcover&img=1&zoom=0"
            ));
            push(format!(
                "https://books.google.com/books/publisher/content/images/frontcover/{enc}?fife=w400-h600"
            ));
        }
    }
    out
}

/// Ok(Some) real cover; Ok(None) hard miss; Err(true) retryable 503/timeout.
async fn try_cover_url(url: &str) -> Result<Option<String>, bool> {
    let parsed = url::Url::parse(url).map_err(|_| false)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Ok(None);
    }
    match parsed.host_str() {
        Some(h) if book_cover_host_ok(h) => {}
        _ => return Ok(None),
    }
    let response = cover_client()
        .map_err(|_| false)?
        .get(parsed)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .header(
            reqwest::header::ACCEPT,
            "image/jpeg,image/png,image/webp,image/*;q=0.8",
        )
        .send()
        .await
        .map_err(|_| true)?;
    let status = response.status();
    if status.as_u16() == 429 || status.as_u16() == 503 {
        return Err(true);
    }
    if !status.is_success() {
        return Ok(None);
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = response.bytes().await.map_err(|_| true)?;
    if bytes.len() < 2500 || bytes.len() > COVER_MAX_BYTES {
        return Ok(None);
    }
    let inspect = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    if inspect.contains("<!doctype")
        || inspect.contains("<html")
        || inspect.contains("temporarily unavailable")
        || inspect.contains("service not available")
    {
        return Ok(None);
    }
    let mime = match mime_from_bytes_and_type(&bytes, content_type.as_deref()) {
        Some(m) => m,
        None => return Ok(None),
    };
    if mime == "image/gif" || mime == "image/svg+xml" || mime == "image/x-icon" {
        return Ok(None);
    }
    if !cover_dims_ok(&bytes, mime) {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(&bytes)
    )))
}

async fn fetch_book_cover_inner(
    image_url: Option<String>,
    volume_id: Option<String>,
) -> Result<Option<String>, String> {
    let candidates = cover_candidates(image_url, volume_id);
    for url in candidates {
        for attempt in 0..3u8 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(500 * u64::from(attempt) + 400)).await;
            }
            match try_cover_url(&url).await {
                Ok(Some(data)) => return Ok(Some(data)),
                Ok(None) => break,
                Err(retry) if retry && attempt < 2 => continue,
                Err(_) => break,
            }
        }
    }
    Ok(None)
}

/// Google Books cover as a data URL. Rate-limits, retries 503s, skips error GIFs.
#[tauri::command]
pub async fn fetch_book_cover(
    image_url: Option<String>,
    volume_id: Option<String>,
) -> Result<Option<String>, String> {
    let permit = cover_gate()
        .acquire()
        .await
        .map_err(|e| format!("cover gate: {e}"))?;
    let result = fetch_book_cover_inner(image_url, volume_id).await;
    drop(permit);
    result
}

/// Open http(s) in the OS default browser. DARKE does not browse in-app.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(url.trim()).map_err(|e| format!("bad url: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http(s) links can open outside DARKE.".into()),
    }
    let href = parsed.as_str().replace('"', "");
    #[cfg(windows)]
    {
        // FileProtocolHandler opens the OS default browser and keeps # / ? / & intact.
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &href])
            .spawn()
            .map_err(|e| format!("open url: {e}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = href;
        Err("Opening links is only supported on Windows.".into())
    }
}
