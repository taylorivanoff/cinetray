(function () {
  const api = window.mediaRenamer;
  if (!api) return;

  const apiKeyEl = document.getElementById('apiKey');
  const testKeyBtn = document.getElementById('testKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const watchPathsList = document.getElementById('watchPaths');
  const addFolderBtn = document.getElementById('addFolder');
  const outputPathEl = document.getElementById('outputPath');
  const pickOutputBtn = document.getElementById('pickOutput');
  const tvTemplateEl = document.getElementById('tvTemplate');
  const movieTemplateEl = document.getElementById('movieTemplate');
  const watcherEnabledEl = document.getElementById('watcherEnabled');
  const usePollingEl = document.getElementById('usePolling');
  const pollingIntervalMsEl = document.getElementById('pollingIntervalMs');
  const dryRunEl = document.getElementById('dryRun');
  const saveBtn = document.getElementById('save');
  const saveStatus = document.getElementById('saveStatus');
  const runManualBtn = document.getElementById('runManual');
  const runManualStatus = document.getElementById('runManualStatus');

  function setStatus(el, text, isError) {
    el.textContent = text;
    el.className = 'status' + (text ? (isError ? ' err' : ' ok') : '');
  }

  function updatePollingVisibility() {
    const section = document.getElementById('pollingIntervalSection');
    if (section) section.hidden = !usePollingEl.checked;
  }

  function renderWatchPaths(paths) {
    watchPathsList.innerHTML = '';
    if (!paths || paths.length === 0) {
      const li = document.createElement('li');
      li.className = 'watch-paths-empty';
      li.textContent = 'No watch folders added yet.';
      watchPathsList.appendChild(li);
      return;
    }
    (paths || []).forEach((p, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.title = p;
      span.textContent = p;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', async () => {
        const next = paths.filter((_, j) => j !== i);
        await api.setSettings({ watchPaths: next });
        loadSettings();
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      watchPathsList.appendChild(li);
    });
  }

  async function loadSettings() {
    const s = await api.getSettings();
    apiKeyEl.value = s.apiKey || '';
    outputPathEl.value = s.outputPath || '';
    tvTemplateEl.value = s.tvTemplate || '';
    movieTemplateEl.value = s.movieTemplate || '';
    watcherEnabledEl.checked = s.watcherEnabled !== false;
    usePollingEl.checked = !!s.usePolling;
    pollingIntervalMsEl.value = String(s.pollingIntervalMs ?? 2000);
    dryRunEl.checked = !!s.dryRun;
    renderWatchPaths(s.watchPaths);
    updatePollingVisibility();
  }

  usePollingEl.addEventListener('change', updatePollingVisibility);

  testKeyBtn.addEventListener('click', async () => {
    const key = apiKeyEl.value.trim();
    setStatus(apiKeyStatus, 'Checking…');
    const ok = await api.testApiKey(key);
    setStatus(apiKeyStatus, ok ? 'API key is valid' : 'Invalid API key', !ok);
  });

  addFolderBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (!folder) return;
    const s = await api.getSettings();
    const paths = [...(s.watchPaths || []), folder];
    await api.setSettings({ watchPaths: paths });
    renderWatchPaths(paths);
  });

  pickOutputBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (folder) outputPathEl.value = folder;
  });

  // Optional (the combined App page may not include a separate `runManual` button).
  if (runManualBtn && runManualStatus) {
    runManualBtn.addEventListener('click', async () => {
      runManualBtn.disabled = true;
      setStatus(runManualStatus, 'Processing…');
      try {
        const result = await api.runManual();
        setStatus(
          runManualStatus,
          `Done: ${result.processed} processed, ${result.errors} error(s). Console shows the changes.`,
          result.errors > 0
        );
      } catch (e) {
        setStatus(runManualStatus, 'Error: ' + (e && e.message ? e.message : 'Unknown'), true);
      }
      runManualBtn.disabled = false;
      setTimeout(() => setStatus(runManualStatus, ''), 5000);
    });
  }

  saveBtn.addEventListener('click', async () => {
    const paths = [];
    watchPathsList.querySelectorAll('li:not(.watch-paths-empty) span').forEach((span) => {
      if (span.textContent) paths.push(span.textContent);
    });
    const interval = parseInt(pollingIntervalMsEl.value, 10);
    await api.setSettings({
      apiKey: apiKeyEl.value.trim(),
      watchPaths: paths,
      outputPath: outputPathEl.value.trim(),
      tvTemplate: tvTemplateEl.value.trim(),
      movieTemplate: movieTemplateEl.value.trim(),
      watcherEnabled: watcherEnabledEl.checked,
      usePolling: usePollingEl.checked,
      pollingIntervalMs: isNaN(interval) || interval < 500 ? 2000 : Math.min(60000, interval),
      dryRun: dryRunEl.checked,
    });
    setStatus(saveStatus, 'Saved');
    setTimeout(() => setStatus(saveStatus, ''), 2000);
  });

  loadSettings();
})();
