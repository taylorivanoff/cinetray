const chokidar = require('chokidar');

let watcher = null;

function startWatcher(settings, onFileAdd) {
  stopWatcher();
  if (!settings.watcherEnabled || settings.watchPaths.length === 0) return;

  const exts = new Set(settings.mediaExtensions.map((e) => e.toLowerCase()));
  const opts = {
    persistent: true,
    ignoreInitial: true,
    depth: 5
  };
  if (settings.usePolling) {
    opts.usePolling = true;
    opts.interval = Math.max(500, settings.pollingIntervalMs ?? 2000);
  }
  watcher = chokidar.watch(settings.watchPaths, opts);

  const handleCandidate = (filePath) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext && exts.has(ext)) {
      onFileAdd(filePath);
    }
  };

  watcher.on('add', handleCandidate);
  watcher.on('change', handleCandidate);
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

module.exports = {
  startWatcher,
  stopWatcher
};
