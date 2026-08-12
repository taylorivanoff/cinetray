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

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.classList.contains('panel-meta') ? 'panel-meta' : 'field-status')
      + (kind ? ` ${kind}` : '');
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
    pollingIntervalMsEl.value = String(s.pollingIntervalMs ?? 60000);
    dryRunEl.checked = !!s.dryRun;
    renderWatchPaths(s.watchPaths);
    updatePollingVisibility();
    window.cineTrayUi?.refreshStatusBadge?.();
  }

  usePollingEl.addEventListener('change', updatePollingVisibility);

  testKeyBtn.addEventListener('click', async () => {
    const key = apiKeyEl.value.trim();
    setStatus(apiKeyStatus, 'Checking…');
    const ok = await api.testApiKey(key);
    setStatus(apiKeyStatus, ok ? 'API key is valid' : 'Invalid API key', ok ? 'ok' : 'err');
  });

  addFolderBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (!folder) return;
    const s = await api.getSettings();
    const paths = [...(s.watchPaths || []), folder];
    await api.setSettings({ watchPaths: paths });
    renderWatchPaths(paths);
    window.cineTrayUi?.refreshStatusBadge?.();
  });

  pickOutputBtn.addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (folder) outputPathEl.value = folder;
  });

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
      pollingIntervalMs: isNaN(interval) || interval < 500 ? 60000 : Math.min(60000, interval),
      dryRun: dryRunEl.checked,
    });
    setStatus(saveStatus, 'Saved', 'ok');
    window.cineTrayUi?.refreshStatusBadge?.();
    setTimeout(() => setStatus(saveStatus, ''), 2000);
  });

  loadSettings();
})();
