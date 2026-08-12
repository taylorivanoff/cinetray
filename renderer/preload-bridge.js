/**
 * Facade matching the Electron preload API (window.mediaRenamer).
 * Requires vendor/tauri-tray-bridge.js and withGlobalTauri.
 */
(function () {
  const bridge = window.tauriTrayBridge;
  if (!bridge) {
    console.error("tauriTrayBridge missing — load vendor/tauri-tray-bridge.js first");
    return;
  }

  const IPC_TIMEOUT_MS = 30_000;

  function invoke(cmd, args) {
    return Promise.race([
      bridge.invoke(cmd, args || {}),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`IPC timeout (${cmd})`)), IPC_TIMEOUT_MS);
      }),
    ]);
  }

  function onEvent(event, cb) {
    let unlisten = null;
    bridge.listen(event, cb).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }

  window.mediaRenamer = {
    getSettings: () => bridge.getSettings(),
    // Settings writes go through cine_set_settings so the sidecar also
    // gets the merged settings (see src-tauri/src/commands.rs).
    setSettings: (settings) => invoke("cine_set_settings", { partial: settings || {} }),
    selectFolder: () => invoke("select_folder"),
    testApiKey: (apiKey) => invoke("test_api_key", { apiKey: apiKey || "" }),
    runManual: () => invoke("run_manual"),
    runStructureCheck: () => invoke("run_structure_check"),
    openConsole: () => invoke("open_console"),
    onLogInit: (cb) => onEvent("log-init", cb),
    onLog: (cb) => onEvent("log", cb),
    requestLogs: () => invoke("request_logs"),
  };
})();
