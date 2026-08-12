/**
 * Facade matching the Electron log-preload API (window.api) for log.html.
 * Requires vendor/tauri-tray-bridge.js and withGlobalTauri.
 */
(function () {
  const bridge = window.tauriTrayBridge;
  if (!bridge) {
    console.error("tauriTrayBridge missing — load vendor/tauri-tray-bridge.js first");
    return;
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

  window.api = {
    onLogInit: (cb) => onEvent("log-init", cb),
    onLog: (cb) => onEvent("log", cb),
    requestLogs: () => bridge.invoke("request_logs", {}),
  };
})();
