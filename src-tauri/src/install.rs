use std::fs;
use std::path::PathBuf;

use rand::RngCore;
use tauri::{AppHandle, Manager};

const INSTALL_ID_FILE: &str = "install.id";

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("app data I/O: {e}"))?;
    Ok(dir)
}

fn new_install_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

/// Stable id for this DARKE install (app data). Created once; never changes.
#[tauri::command]
pub fn get_install_id(app: AppHandle) -> Result<String, String> {
    let path = data_dir(&app)?.join(INSTALL_ID_FILE);
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let id = raw.trim().to_string();
        if !id.is_empty() {
            return Ok(id);
        }
    }
    let id = new_install_id();
    fs::write(&path, &id).map_err(|e| e.to_string())?;
    Ok(id)
}
