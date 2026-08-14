(function () {
  const api = window.mediaRenamer;
  if (!api) return;

  const platform = window.navigator.platform || '';
  if (platform.includes('Mac')) document.body.classList.add('platform-darwin');
  else if (platform.includes('Win')) document.body.classList.add('platform-win32');
  if (globalThis.tauriTrayBridge?.bindWindowControls) {
    globalThis.tauriTrayBridge.bindWindowControls(document);
  }

  const runManualBtn = document.getElementById('runManualActions');
  const runManualStatus = document.getElementById('runManualStatusActions');
  const runStructureBtn = document.getElementById('runStructureCheck');
  const runStructureStatus = document.getElementById('runStructureStatus');
  const consoleOut = document.getElementById('console-out');
  const statusBadge = document.getElementById('status-badge');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

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

  if (consoleOut && api.onLogInit && api.onLog) {
    function addLine(entry) {
      if (!entry?.message) return;
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
      if (!entries || entries.length === 0) {
        consoleOut.innerHTML = '<div class="console-empty">No log entries yet. Run sync actions to see output here.</div>';
      } else {
        entries.forEach(addLine);
      }
    });

    api.onLog(addLine);
    api.requestLogs();
  }

  window.cineTrayUi = { refreshStatusBadge };

  refreshStatusBadge();
})();
