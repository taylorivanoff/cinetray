const Store = require('electron-store');
const { app } = require('electron');
const path = require('path');

const DEFAULT_SETTINGS = {
  apiKey: '',
  watchPaths: [],
  tvTemplate: '{show}/Season {s}/{show} - S{s}E{e} - {title}.{ext}',
  movieTemplate: '{title} ({year}).{ext}',
  outputPath: '',
  usePolling: true,
  pollingIntervalSeconds: 60,
  dryRun: false,
  mediaExtensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'm4v', 'webm'],
  structureCheckIntervalMs: 30 * 60 * 1000
};

const LEGACY_STORE_NAME = 'tidy-tray-settings';

const settingsStore = new Store({
  name: 'cinetray-settings',
  defaults: {
    ...DEFAULT_SETTINGS,
    opacity: 1,
    alwaysOnTop: false,
    startMinimised: false,
    windowBounds: null
  }
});

function migrateFromLegacyStore() {
  if (settingsStore.get('_migratedFromTidyTray')) return;

  const legacy = new Store({
    name: LEGACY_STORE_NAME,
    cwd: path.join(app.getPath('appData'), 'Tidy Tray')
  });
  if (legacy.size === 0) {
    settingsStore.set('_migratedFromTidyTray', true);
    return;
  }

  for (const [key, value] of Object.entries(legacy.store)) {
    settingsStore.set(key, value);
  }
  settingsStore.set('_migratedFromTidyTray', true);
}

migrateFromLegacyStore();

function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.35, n));
}

function clampPollingIntervalSeconds(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SETTINGS.pollingIntervalSeconds;
  return Math.min(3600, n);
}

function readPollingIntervalSeconds(s) {
  if (s.pollingIntervalSeconds != null) {
    return clampPollingIntervalSeconds(s.pollingIntervalSeconds);
  }
  if (s.pollingIntervalMs != null) {
    return clampPollingIntervalSeconds(Math.round(s.pollingIntervalMs / 1000));
  }
  return DEFAULT_SETTINGS.pollingIntervalSeconds;
}

function getSettings() {
  const s = settingsStore.store;
  return {
    apiKey: s.apiKey ?? '',
    watchPaths: s.watchPaths ?? [],
    tvTemplate: s.tvTemplate ?? DEFAULT_SETTINGS.tvTemplate,
    movieTemplate: s.movieTemplate ?? DEFAULT_SETTINGS.movieTemplate,
    outputPath: s.outputPath ?? '',
    usePolling: s.usePolling !== false,
    pollingIntervalSeconds: readPollingIntervalSeconds(s),
    dryRun: !!s.dryRun,
    mediaExtensions: s.mediaExtensions ?? DEFAULT_SETTINGS.mediaExtensions,
    structureCheckIntervalMs: s.structureCheckIntervalMs ?? DEFAULT_SETTINGS.structureCheckIntervalMs,
    opacity: clampOpacity(s.opacity),
    alwaysOnTop: !!s.alwaysOnTop,
    startMinimised: !!s.startMinimised
  };
}

function setSettings(settings) {
  if (settings.opacity !== undefined) settingsStore.set('opacity', clampOpacity(settings.opacity));
  if (settings.alwaysOnTop !== undefined) settingsStore.set('alwaysOnTop', !!settings.alwaysOnTop);
  if (settings.startMinimised !== undefined) settingsStore.set('startMinimised', !!settings.startMinimised);
  if (settings.apiKey !== undefined) settingsStore.set('apiKey', settings.apiKey);
  if (settings.watchPaths !== undefined) settingsStore.set('watchPaths', settings.watchPaths);
  if (settings.tvTemplate !== undefined) settingsStore.set('tvTemplate', settings.tvTemplate);
  if (settings.movieTemplate !== undefined) settingsStore.set('movieTemplate', settings.movieTemplate);
  if (settings.outputPath !== undefined) settingsStore.set('outputPath', settings.outputPath);
  if (settings.usePolling !== undefined) settingsStore.set('usePolling', settings.usePolling);
  if (settings.pollingIntervalSeconds !== undefined) {
    settingsStore.set('pollingIntervalSeconds', clampPollingIntervalSeconds(settings.pollingIntervalSeconds));
  }
  if (settings.dryRun !== undefined) settingsStore.set('dryRun', settings.dryRun);
  if (settings.mediaExtensions !== undefined) settingsStore.set('mediaExtensions', settings.mediaExtensions);
  if (settings.structureCheckIntervalMs !== undefined) {
    settingsStore.set('structureCheckIntervalMs', settings.structureCheckIntervalMs);
  }
  return getSettings();
}

function getWindowBounds() {
  return settingsStore.get('windowBounds', null);
}

function setWindowBounds(bounds) {
  settingsStore.set('windowBounds', bounds);
}

module.exports = {
  DEFAULT_SETTINGS,
  settingsStore,
  getSettings,
  setSettings,
  getWindowBounds,
  setWindowBounds
};
