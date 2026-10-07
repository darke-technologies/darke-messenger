use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use serde::Serialize;
use serde_json::Value;

use crate::net::http_client;

const SESSIONS_URL: &str = "https://api.stripe.com/v1/checkout/sessions";
const AMOUNT_CENTS: &str = "9900";
const SUCCESS_URL: &str = "https://darke.ai/?startup_listed=1";
const CANCEL_URL: &str = "https://darke.ai/?startup_listed=0";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StripeCheckoutCreated {
    session_id: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StripeCheckoutStatus {
    session_id: String,
    status: String,
    paid: bool,
    listing_id: String,
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

fn stripe_secret() -> Result<String, String> {
    load_dotenv();
    let key = std::env::var("STRIPE_SECRET_KEY")
        .unwrap_or_default()
        .trim()
        .to_string();
    if key.is_empty() || !key.starts_with("sk_") {
        return Err(
            "Stripe is not configured. Add STRIPE_SECRET_KEY to .env, then restart DARKE."
                .into(),
        );
    }
    Ok(key)
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("open checkout: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("open checkout: {e}"))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("open checkout: {e}"))?;
        return Ok(());
    }
}

#[tauri::command]
pub fn stripe_configured() -> bool {
    stripe_secret().is_ok()
}

#[tauri::command]
pub async fn stripe_create_listing_checkout(
    listing_id: String,
    listing_name: String,
) -> Result<StripeCheckoutCreated, String> {
    let listing_id = listing_id.trim().to_string();
    if listing_id.len() < 8 {
        return Err("Listing id missing.".into());
    }
    let name = listing_name.trim();
    let product = if name.is_empty() {
        "DARKE STARTUPS listing (1 year)".to_string()
    } else {
        format!("{name} — public STARTUPS listing (1 year)")
    };
    let secret = stripe_secret()?;
    let encoded = {
        let mut body = url::form_urlencoded::Serializer::new(String::new());
        body.append_pair("mode", "payment");
        body.append_pair("success_url", SUCCESS_URL);
        body.append_pair("cancel_url", CANCEL_URL);
        body.append_pair("client_reference_id", &listing_id);
        body.append_pair("metadata[listing_id]", &listing_id);
        body.append_pair("line_items[0][quantity]", "1");
        body.append_pair("line_items[0][price_data][currency]", "usd");
        body.append_pair("line_items[0][price_data][unit_amount]", AMOUNT_CENTS);
        body.append_pair("line_items[0][price_data][product_data][name]", &product);
        body.append_pair(
            "line_items[0][price_data][product_data][description]",
            "Upgrade this startup to the public STARTUPS page for $99/year",
        );
        body.finish()
    };
    let client = http_client()?;
    let res = client
        .post(SESSIONS_URL)
        .basic_auth(&secret, Some(""))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encoded)
        .send()
        .await
        .map_err(|e| format!("Stripe request failed: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Stripe body: {e}"))?;
    if !status.is_success() {
        return Err(stripe_error_text(&text, status.as_u16()));
    }
    let json: Value =
        serde_json::from_str(&text).map_err(|e| format!("Stripe JSON: {e}"))?;
    let session_id = json
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let url = json
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if session_id.is_empty() || url.is_empty() {
        return Err("Stripe did not return a checkout URL.".into());
    }
    let _ = open_browser(&url);
    Ok(StripeCheckoutCreated { session_id, url })
}

#[tauri::command]
pub async fn stripe_listing_checkout_status(
    session_id: String,
) -> Result<StripeCheckoutStatus, String> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err("Checkout session missing.".into());
    }
    let secret = stripe_secret()?;
    let client = http_client()?;
    let url = format!("{SESSIONS_URL}/{session_id}");
    let res = client
        .get(url)
        .basic_auth(&secret, Some(""))
        .send()
        .await
        .map_err(|e| format!("Stripe request failed: {e}"))?;
    let http = res.status();
    let text = res.text().await.map_err(|e| format!("Stripe body: {e}"))?;
    if !http.is_success() {
        return Err(stripe_error_text(&text, http.as_u16()));
    }
    let json: Value =
        serde_json::from_str(&text).map_err(|e| format!("Stripe JSON: {e}"))?;
    let status = json
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("open")
        .to_string();
    let payment_status = json
        .get("payment_status")
        .and_then(Value::as_str)
        .unwrap_or("");
    let listing_id = json
        .pointer("/metadata/listing_id")
        .and_then(Value::as_str)
        .or_else(|| json.get("client_reference_id").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    Ok(StripeCheckoutStatus {
        session_id,
        status,
        paid: payment_status == "paid",
        listing_id,
    })
}

fn stripe_error_text(body: &str, status: u16) -> String {
    if let Ok(json) = serde_json::from_str::<Value>(body) {
        if let Some(msg) = json.pointer("/error/message").and_then(Value::as_str) {
            return msg.to_string();
        }
    }
    format!("Stripe HTTP {status}")
}
