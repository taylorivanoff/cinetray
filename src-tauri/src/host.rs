use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use parking_lot::Mutex;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};

type PendingMap = Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>;

/// Long-running Node JSON-lines host for CineTray's media pipeline
/// (chokidar watcher, renamer, TMDB lookups, structure checks).
pub struct CineHost {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    pending: PendingMap,
    next_id: AtomicU64,
    app: Option<AppHandle>,
    project_root: PathBuf,
}

impl CineHost {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            app: None,
            project_root: resolve_project_root(None),
        }
    }

    pub fn set_app_handle(&mut self, app: AppHandle) {
        self.project_root = resolve_project_root(Some(&app));
        self.app = Some(app);
    }

    pub fn ensure_started(&mut self) -> Result<(), String> {
        if self.child.is_some() {
            return Ok(());
        }
        let script = resolve_host_script(&self.project_root)?;
        let node = which::which("node").map_err(|_| {
            "Node.js not found on PATH. Install Node 18+ to run CineTray's media pipeline."
                .to_string()
        })?;

        let mut child = Command::new(node)
            .arg(&script)
            .current_dir(&self.project_root)
            .env(
                "NODE_PATH",
                self.project_root.join("node_modules").display().to_string(),
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start CineTray sidecar: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Sidecar stdin missing".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Sidecar stdout missing".to_string())?;

        let pending = self.pending.clone();
        let app = self.app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
                    continue;
                };

                if value.get("type").and_then(|v| v.as_str()) == Some("log") {
                    if let Some(app) = &app {
                        let entry = value.get("entry").cloned().unwrap_or(Value::Null);
                        let _ = app.emit("log", entry);
                    }
                    continue;
                }

                if let Some(id) = value.get("id").and_then(|v| v.as_u64()) {
                    if let Some(tx) = pending.lock().remove(&id) {
                        let _ = tx.send(value);
                    }
                }
            }
        });

        self.stdin = Some(stdin);
        self.child = Some(child);
        Ok(())
    }

    /// Send `{ id, op, ...extra }` and block for the matching `{ id, ... }` response.
    /// Unsolicited `{ type: "log" }` lines are routed to the renderer independently
    /// by the background reader thread, so they never interfere with this call.
    pub fn request(&mut self, op: &str, mut extra: Map<String, Value>) -> Result<Value, String> {
        self.ensure_started()?;
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        extra.insert("id".into(), json!(id));
        extra.insert("op".into(), json!(op));

        let (tx, rx) = mpsc::channel();
        self.pending.lock().insert(id, tx);

        let line = format!("{}\n", Value::Object(extra));
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| "Sidecar not started".to_string())?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("Sidecar write failed: {e}"))?;
        stdin
            .flush()
            .map_err(|e| format!("Sidecar flush failed: {e}"))?;

        rx.recv_timeout(Duration::from_secs(120)).map_err(|_| {
            self.pending.lock().remove(&id);
            "Sidecar timed out waiting for response".to_string()
        })
    }

    pub fn shutdown(&mut self) {
        if let Some(stdin) = self.stdin.as_mut() {
            let line = format!("{}\n", json!({ "id": 0, "op": "shutdown" }));
            let _ = stdin.write_all(line.as_bytes());
            let _ = stdin.flush();
        }
        if let Some(mut child) = self.child.take() {
            // Give the sidecar a brief moment to exit gracefully before killing it.
            std::thread::sleep(Duration::from_millis(200));
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdin = None;
        self.pending.lock().clear();
    }
}

impl Drop for CineHost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn resolve_project_root(app: Option<&AppHandle>) -> PathBuf {
    if let Some(app) = app {
        if let Ok(resource_dir) = app.path().resource_dir() {
            // Packaged: resources land under resource_dir/sidecar + resource_dir/main
            if resource_dir.join("sidecar").join("host.mjs").is_file() {
                return resource_dir;
            }
            // Sometimes files are nested one level deeper
            if resource_dir
                .join("resources")
                .join("sidecar")
                .join("host.mjs")
                .is_file()
            {
                return resource_dir.join("resources");
            }
        }
    }
    // Dev: src-tauri/ → project root
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or(manifest)
}

fn resolve_host_script(project_root: &Path) -> Result<PathBuf, String> {
    let candidates = [
        project_root.join("sidecar").join("host.mjs"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("sidecar")
            .join("host.mjs"),
    ];
    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(format!(
        "sidecar/host.mjs not found under {}",
        project_root.display()
    ))
}
