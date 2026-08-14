mod commands;
mod host;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{json, Map};
use tauri::{Listener, Manager};
use tauri_tray_base::{
    apply_window_settings, install_state, set_on_before_quit, setup_tray, sync_autostart,
    TrayBaseOptions, TrayExtraItem, TraySetupOptions,
};

pub struct AppRuntime {
    pub host: Arc<Mutex<host::CineHost>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let host = Arc::new(Mutex::new(host::CineHost::new()));

    let builder = tauri_tray_base::with_common_plugins(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppRuntime { host: host.clone() })
        .invoke_handler(tauri::generate_handler![
            tauri_tray_base::settings_get,
            tauri_tray_base::app_get_state,
            commands::cine_set_settings,
            commands::select_folder,
            commands::test_api_key,
            commands::run_manual,
            commands::run_structure_check,
            commands::request_logs,
            commands::open_console,
        ])
        .setup(move |app| {
            let mut defaults = HashMap::new();
            defaults.insert("apiKey".into(), json!(""));
            defaults.insert("watchPaths".into(), json!([]));
            defaults.insert(
                "tvTemplate".into(),
                json!("{show}/Season {s}/{show} - S{s}E{e} - {title}.{ext}"),
            );
            defaults.insert("movieTemplate".into(), json!("{title} ({year}).{ext}"));
            defaults.insert("outputPath".into(), json!(""));
            defaults.insert("usePolling".into(), json!(true));
            defaults.insert("pollingIntervalSeconds".into(), json!(60));
            defaults.insert("dryRun".into(), json!(false));
            defaults.insert(
                "mediaExtensions".into(),
                json!(["mkv", "mp4", "avi", "mov", "wmv", "m4v", "webm"]),
            );
            defaults.insert(
                "structureCheckIntervalMs".into(),
                json!(30 * 60 * 1000_i64),
            );
            defaults.insert("opacity".into(), json!(1.0));
            defaults.insert("alwaysOnTop".into(), json!(false));
            defaults.insert("startMinimised".into(), json!(false));

            install_state(
                app.handle(),
                TrayBaseOptions {
                    app_name: "CineTray".into(),
                    settings_file_name: "cinetray-settings.json".into(),
                    defaults,
                    extra_tray_items: vec![
                        TrayExtraItem {
                            id: "process-watch".into(),
                            label: "Process watch folders".into(),
                        },
                        TrayExtraItem {
                            id: "show-console".into(),
                            label: "Show console".into(),
                        },
                    ],
                    ..Default::default()
                },
            )?;

            setup_tray(app.handle(), TraySetupOptions::default())?;
            apply_window_settings(app.handle());
            tauri_tray_base::enable_frameless_chrome(app.handle());
            sync_autostart(app.handle());

            host.lock().set_app_handle(app.handle().clone());

            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()));
            let _ = std::fs::create_dir_all(&data_dir);

            let initial_settings = app
                .state::<tauri_tray_base::TrayBaseState>()
                .settings
                .lock()
                .to_value();

            let host_for_init = host.clone();
            std::thread::spawn(move || {
                let mut extra = Map::new();
                extra.insert("dataDir".into(), json!(data_dir.to_string_lossy()));
                extra.insert("settings".into(), initial_settings);
                let _ = host_for_init.lock().request("init", extra);
            });

            let handle_for_tray = app.handle().clone();
            let host_for_tray = host.clone();
            app.listen("tray:action", move |event| {
                let action = event.payload().trim_matches('"').to_string();
                match action.as_str() {
                    "process-watch" => {
                        tauri_tray_base::show_main(&handle_for_tray);
                        let host = host_for_tray.clone();
                        std::thread::spawn(move || {
                            let _ = host.lock().request("run-manual", Map::new());
                        });
                    }
                    "show-console" => {
                        let _ = commands::open_console_window(&handle_for_tray);
                    }
                    _ => {}
                }
            });

            let host_for_quit = host.clone();
            set_on_before_quit(app.handle(), move || {
                host_for_quit.lock().shutdown();
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            tauri_tray_base::on_window_event(window, event);
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running cinetray");
}
