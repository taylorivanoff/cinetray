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
  const usePollingEl = document.getElementById('usePolling');
  const pollingIntervalSecondsEl = document.getElementById('pollingIntervalSeconds');
  const dryRunEl = document.getElementById('dryRun');
  const saveStatus = document.getElementById('saveStatus');

  let isLoading = false;
  let saveFlashTimer = null;

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.classList.contains('panel-meta') ? 'panel-meta' : 'field-status')
      + (kind ? ` ${kind}` : '');
  }

  function normalizePollingIntervalSeconds(value) {
    const interval = parseInt(value, 10);
    if (!Number.isFinite(interval) || interval < 1) return 60;
    return Math.min(3600, interval);
  }

  function flashSaved() {
    setStatus(saveStatus, 'Saved', 'ok');
    if (saveFlashTimer) clearTimeout(saveFlashTimer);
    saveFlashTimer = setTimeout(() => {
      saveFlashTimer = null;
      setStatus(saveStatus, '');
    }, 1500);
  }

  async function persistSettings(partial) {
    if (isLoading) return;
    try {
      await api.setSettings(partial);
      flashSaved();
      window.cineTrayUi?.refreshStatusBadge?.();
    } catch (_) {}
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
      removeBtn.className = 'text-btn';
      removeBtn.addEventListener('click', async () => {
        const next = paths.filter((_, j) => j !== i);
        await persistSettings({ watchPaths: next });
        renderWatchPaths(next);
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      watchPathsList.appendChild(li);
    });
  }

  async function loadSettings() {
    isLoading = true;
    try {
      const s = await api.getSettings();
      apiKeyEl.value = s.apiKey || '';
      outputPathEl.value = s.outputPath || '';
      tvTemplateEl.value = s.tvTemplate || '';
      movieTemplateEl.value = s.movieTemplate || '';
      usePollingEl.checked = !!s.usePolling;
      pollingIntervalSecondsEl.value = String(s.pollingIntervalSeconds ?? 60);
      dryRunEl.checked = !!s.dryRun;
      renderWatchPaths(s.watchPaths);
      updatePollingVisibility();
      window.cineTrayUi?.refreshStatusBadge?.();
    } finally {
      isLoading = false;
    }
  }

  usePollingEl.addEventListener('change', () => {
    updatePollingVisibility();
    persistSettings({ usePolling: usePollingEl.checked });
  });

  dryRunEl.addEventListener('change', () => {
    persistSettings({ dryRun: dryRunEl.checked });
  });

  for (const el of [outputPathEl, tvTemplateEl, movieTemplateEl]) {
    el.addEventListener('change', () => {
      const key = el.id === 'outputPath'
        ? 'outputPath'
        : el.id === 'tvTemplate'
          ? 'tvTemplate'
          : 'movieTemplate';
      persistSettings({ [key]: el.value.trim() });
    });
  }

  apiKeyEl.addEventListener('change', () => {
    persistSettings({ apiKey: apiKeyEl.value.trim() });
  });

  pollingIntervalSecondsEl.addEventListener('change', () => {
    const pollingIntervalSeconds = normalizePollingIntervalSeconds(pollingIntervalSecondsEl.value);
    pollingIntervalSecondsEl.value = String(pollingIntervalSeconds);
    persistSettings({ pollingIntervalSeconds });
  });

  testKeyBtn.addEventListener('click', async () => {
    const key = apiKeyEl.value.trim();
    setStatus(apiKeyStatus, 'Checking…');
    const ok = await api.testApiKey(key);
    if (ok && key) {
      await persistSettings({ apiKey: key });
      apiKeyEl.blur();
    }
    setStatus(apiKeyStatus, ok ? 'API key is valid' : 'Invalid API key', ok ? 'ok' : 'err');
  });

  addFolderBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (!folder) return;
    const s = await api.getSettings();
    const paths = [...(s.watchPaths || []), folder];
    await persistSettings({ watchPaths: paths });
    renderWatchPaths(paths);
  });

  pickOutputBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (!folder) return;
    outputPathEl.value = folder;
    await persistSettings({ outputPath: folder });
  });

  loadSettings();
})();
