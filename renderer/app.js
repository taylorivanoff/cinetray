(function () {
  const api = window.mediaRenamer;
  if (!api) return;

  const platform = window.navigator.platform || '';
  if (platform.includes('Mac')) document.body.classList.add('platform-darwin');
  else if (platform.includes('Win')) document.body.classList.add('platform-win32');

  const runManualBtn = document.getElementById('runManualActions');
  const runManualStatus = document.getElementById('runManualStatusActions');
  const runStructureBtn = document.getElementById('runStructureCheck');
  const runStructureStatus = document.getElementById('runStructureStatus');
  const consoleOut = document.getElementById('console-out');
  const statusBadge = document.getElementById('status-badge');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const logPanel = document.getElementById('log-panel');
  const btnDebug = document.getElementById('btn-debug');

  let showDebugBar = false;
  const logLines = [];
  const MAX_LOG_LINES = 40;

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.id === 'status-badge' ? 'status-badge' : el.classList.contains('panel-meta') ? 'panel-meta' : 'field-status')
      + (kind ? ` ${kind}` : '');
  }

  function setBadge(text, state) {
    if (!statusBadge) return;
    statusBadge.textContent = text;
    statusBadge.className = `status-badge ${state || ''}`.trim();
  }

  function setProgress(on, message) {
    if (!progressBar || !progressText) return;
    progressBar.classList.toggle('hidden', !on);
    progressText.textContent = message || '';
    if (runManualBtn) runManualBtn.disabled = on;
    if (runStructureBtn) runStructureBtn.disabled = on;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function appendLogLine(entry) {
    if (!entry?.message) return;
    const time = entry.time ? entry.time.slice(11, 19) : '';
    logLines.push({ level: entry.level || 'info', text: `[${time}] ${entry.message}` });

    while (logLines.length > MAX_LOG_LINES) logLines.shift();

    if (showDebugBar && logPanel) {
      logPanel.innerHTML = logLines.map((l) =>
        `<div class="log-line ${l.level}">${escapeHtml(l.text)}</div>`
      ).join('');
      logPanel.scrollTop = logPanel.scrollHeight;
    }
  }

  function renderDebugPanel() {
    if (!showDebugBar || !logPanel) return;
    logPanel.innerHTML = logLines.map((l) =>
      `<div class="log-line ${l.level}">${escapeHtml(l.text)}</div>`
    ).join('');
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  async function applyDebugBar(on) {
    showDebugBar = !!on;
    if (logPanel) {
      logPanel.classList.toggle('hidden', !showDebugBar);
      logPanel.hidden = !showDebugBar;
    }
    if (btnDebug) {
      btnDebug.classList.toggle('is-on', showDebugBar);
      btnDebug.setAttribute('aria-pressed', showDebugBar ? 'true' : 'false');
    }
    if (showDebugBar) renderDebugPanel();
    try {
      await api.setSettings?.({ showDebugBar: showDebugBar });
    } catch (_) {}
  }

  async function refreshStatusBadge() {
    try {
      const s = await api.getSettings();
      if (!s.apiKey?.trim()) {
        setBadge('No API key', 'error');
        return;
      }
      if (!s.watchPaths?.length) {
        setBadge('No folders', 'warn');
        return;
      }
      if (s.watcherEnabled === false) {
        setBadge('Watching off', 'warn');
        return;
      }
      if (s.dryRun) {
        setBadge('Dry run', 'ok');
        return;
      }
      setBadge('Watching', 'ok');
    } catch (_) {
      setBadge('Ready', 'ok');
    }
  }

  runManualBtn?.addEventListener('click', async () => {
    setProgress(true, 'Processing watch folders…');
    setStatus(runManualStatus, 'Processing…');
    try {
      const result = await api.runManual();
      setStatus(
        runManualStatus,
        `Done: ${result.processed} processed, ${result.errors} error(s)`,
        result.errors > 0 ? 'err' : 'ok'
      );
    } catch (e) {
      setStatus(runManualStatus, 'Error: ' + (e?.message || 'Unknown'), 'err');
    }
    setProgress(false);
    runManualBtn.disabled = false;
    setTimeout(() => setStatus(runManualStatus, ''), 5000);
    refreshStatusBadge();
  });

  runStructureBtn?.addEventListener('click', async () => {
    setProgress(true, 'Checking folder structure…');
    setStatus(runStructureStatus, 'Checking…');
    try {
      await api.runStructureCheck();
      setStatus(runStructureStatus, 'Done. See console for details.', 'ok');
    } catch (e) {
      setStatus(runStructureStatus, 'Error: ' + (e?.message || 'Unknown'), 'err');
    }
    setProgress(false);
    setTimeout(() => setStatus(runStructureStatus, ''), 5000);
  });

  btnDebug?.addEventListener('click', () => applyDebugBar(!showDebugBar));

  if (consoleOut && api.onLogInit && api.onLog) {
    function addLine(entry) {
      appendLogLine(entry);
      const div = document.createElement('div');
      div.className = 'console-line ' + (entry.level || 'info');
      div.innerHTML =
        '<span class="console-time">[' + escapeHtml(entry.time || '') + ']</span>' +
        '<span class="console-msg">' + escapeHtml(entry.message || '') + '</span>';
      if (consoleOut.querySelector('.console-empty')) consoleOut.innerHTML = '';
      consoleOut.appendChild(div);
      consoleOut.scrollTop = consoleOut.scrollHeight;
    }

    api.onLogInit((entries) => {
      consoleOut.innerHTML = '';
      logLines.length = 0;
      if (!entries || entries.length === 0) {
        consoleOut.innerHTML = '<div class="console-empty">No log entries yet. Run sync actions to see output here.</div>';
      } else {
        entries.forEach(addLine);
      }
      if (showDebugBar) renderDebugPanel();
    });

    api.onLog(addLine);
    api.requestLogs();
  }

  window.cineTrayUi = { refreshStatusBadge };

  (async () => {
    try {
      const s = await api.getSettings();
      await applyDebugBar(!!s.showDebugBar);
    } catch (_) {
      await applyDebugBar(false);
    }
    refreshStatusBadge();
  })();
})();
