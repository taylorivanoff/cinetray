use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_tray_base::TrayBaseState;

use crate::AppRuntime;

fn file_path_to_string(path: FilePath) -> Option<String> {
    path.into_path()
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn select_folder(app: AppHandle) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose folder")
        .blocking_pick_folder();
    picked.and_then(file_path_to_string)
}

#[tauri::command]
pub fn test_api_key(runtime: State<'_, AppRuntime>, api_key: String) -> Result<bool, String> {
    let mut extra = Map::new();
    extra.insert("apiKey".into(), json!(api_key));

    let mut host = runtime.host.lock();
    let response = host.request("test-api-key", extra)?;
    Ok(response
        .get("valid")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

#[tauri::command]
pub fn run_manual(runtime: State<'_, AppRuntime>) -> Result<Value, String> {
    let mut host = runtime.host.lock();
    let response = host.request("run-manual", Map::new())?;
    Ok(json!({
        "processed": response.get("processed").and_then(|v| v.as_u64()).unwrap_or(0),
        "errors": response.get("errors").and_then(|v| v.as_u64()).unwrap_or(0),
    }))
}

#[tauri::command]
pub fn run_structure_check(runtime: State<'_, AppRuntime>) -> Result<(), String> {
    let mut host = runtime.host.lock();
    host.request("run-structure-check", Map::new())?;
    Ok(())
}

/// Fetches the log buffer from the sidecar and emits it as `log-init` to the
/// requesting window; live entries stream separately via the `log` event.
#[tauri::command]
pub fn request_logs(window: WebviewWindow, runtime: State<'_, AppRuntime>) -> Result<(), String> {
    let response = {
        let mut host = runtime.host.lock();
        host.request("get-logs", Map::new())?
    };
    let entries = response.get("logs").cloned().unwrap_or_else(|| json!([]));
    let _ = window.emit("log-init", entries);
    Ok(())
}

pub fn open_console_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("console") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "console", WebviewUrl::App("log.html".into()))
        .title("CineTray – Console")
        .inner_size(700.0, 400.0)
        .min_inner_size(400.0, 200.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_console(app: AppHandle) -> Result<(), String> {
    open_console_window(&app)
}

/// Wraps `tauri_tray_base::settings_set` (persist + emit `settings:changed` +
/// rebuild tray menu) and also forwards the merged settings to the sidecar.
#[tauri::command]
pub fn cine_set_settings(
    app: AppHandle,
    state: State<'_, TrayBaseState>,
    runtime: State<'_, AppRuntime>,
    partial: Value,
) -> Result<Value, String> {
    let next = tauri_tray_base::settings_set(app, state, partial)?;

    let mut extra = Map::new();
    extra.insert("settings".into(), next.clone());
    let mut host = runtime.host.lock();
    let _ = host.request("update-settings", extra);

    Ok(next)
}
