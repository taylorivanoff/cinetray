const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const loadElectronTrayBase = require('./load-electron-tray-base');
const { configureAppIsolation, run } = loadElectronTrayBase();

configureAppIsolation({
  appId: 'io.github.taylorivanoff.cinetray',
  appName: 'CineTray'
});

const { settingsStore, getSettings, setSettings } = require('./store');
const { startWatcher, stopWatcher } = require('./watcher');
const { processFile } = require('./renamer');
const { getFilesToProcess } = require('./manual-run');
const { testApiKey } = require('./tmdb');
const { addLog } = require('./logger');
const {
  addProcessedRecord,
  removeProcessedRecords,
  wasProcessed,
  getProcessedRecords
} = require('./processed-db');
const { runStructureCheck } = require('./structure-checker');
const { initLogStreaming, createOrShowLogWindow } = require('./log-window');
const { waitForFileReady } = require('./file-ready');

const APP_NAME = 'CineTray';

const ABS_MIN_WINDOW = { width: 1087, height: 706 };
const DEFAULT_WINDOW = { width: 1087, height: 706 };

let structureCheckTimer = null;
const inFlight = new Set();

async function runManualProcess() {
  const settings = getSettings();
  addLog('info', '=== Manual run started ===');
  if (!settings.apiKey?.trim()) {
    addLog('error', 'Manual run: TMDB API key not set.');
    return { processed: 0, errors: 1 };
  }
  if (settings.watchPaths.length === 0) {
    addLog('warn', 'Manual run: No watch folders configured.');
    return { processed: 0, errors: 0 };
  }

  const rootsToCheck = settings.outputPath?.trim() ? [settings.outputPath.trim()] : settings.watchPaths;
  for (const root of rootsToCheck) {
    const issues = await runStructureCheck(root, settings);
    if (issues.length > 0) {
      addLog('warn', `Pre-scan (${root}): ${issues.length} structure issue(s) found.`);
      for (const i of issues.slice(0, 5)) addLog('warn', `Structure: [${i.kind}] ${i.message}`);
      if (issues.length > 5) addLog('warn', `...and ${issues.length - 5} more.`);

      const recurringFiles = issues
        .filter((i) => i.kind === 'recurring_folder')
        .map((i) => i.filePath);

      if (recurringFiles.length > 0) {
        removeProcessedRecords(recurringFiles);
        addLog('warn', `Auto-fix: reprocessing ${recurringFiles.length} file(s) in recurring folders.`);
      }
    }
  }

  const files = await getFilesToProcess(settings);
  addLog('info', `Manual run: Found ${files.length} file(s) in watch folders.`);
  let processed = 0;
  let errors = 0;
  for (const filePath of files) {
    try {
      if (wasProcessed(filePath)) {
        addLog('info', `Skipped (already processed): ${filePath}`);
        continue;
      }
      const result = await processFile(filePath, getSettings());
      if (result.success && result.destPath) {
        const verb = getSettings().dryRun ? 'Would rename' : 'Renamed';
        addLog('info', `${verb}: ${filePath} → ${result.destPath}`);
        if (!getSettings().dryRun) {
          addProcessedRecord({
            sourcePath: filePath,
            destPath: result.destPath,
            processedAt: new Date().toISOString(),
            type: result.type ?? (result.showName ? 'tv' : 'movie'),
            showName: result.showName,
            season: result.season,
            episode: result.episode,
            movieTitle: result.movieTitle,
            year: result.year
          });
        }
        processed++;
      } else {
        addLog('error', `${filePath}: ${result.error ?? 'Unknown error'}`);
        errors++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `${filePath}: ${msg}`);
      errors++;
    }
  }
  addLog('info', `Manual run done: ${processed} processed, ${errors} error(s).`);
  addLog('info', '=== Manual run finished ===');
  return { processed, errors };
}

function refreshWatcher() {
  const settings = getSettings();
  stopWatcher();
  startWatcher(settings, async (filePath) => {
    if (inFlight.has(filePath)) return;
    inFlight.add(filePath);
    try {
      if (wasProcessed(filePath)) {
        addLog('info', `Skipped (already processed): ${filePath}`);
        return;
      }

      const ready = settings.dryRun ? true : await waitForFileReady(filePath);
      if (!ready) {
        addLog('warn', `Auto: file not ready (locked/in-progress), skipping for now: ${filePath}`);
        return;
      }

      const result = await processFile(filePath, getSettings());
      if (result.success && result.destPath) {
        const verb = getSettings().dryRun ? 'Would rename' : 'Renamed';
        addLog('info', `${verb}: ${filePath} → ${result.destPath}`);
        if (!getSettings().dryRun) {
          addProcessedRecord({
            sourcePath: filePath,
            destPath: result.destPath,
            processedAt: new Date().toISOString(),
            type: result.type ?? (result.showName ? 'tv' : 'movie'),
            showName: result.showName,
            season: result.season,
            episode: result.episode,
            movieTitle: result.movieTitle,
            year: result.year
          });
        }
      } else {
        addLog('error', `${filePath}: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `${filePath}: ${msg}`);
    } finally {
      inFlight.delete(filePath);
    }
  });
}

async function runStructureCheckNow() {
  const settings = getSettings();
  const rootsToCheck = settings.outputPath?.trim()
    ? [settings.outputPath.trim()]
    : settings.watchPaths.filter((p) => p?.trim());

  if (rootsToCheck.length === 0) {
    addLog('warn', 'Structure check: No output or watch folders configured.');
    return;
  }

  addLog('info', `Structure check running on ${rootsToCheck.length} folder(s)...`);
  let totalIssues = 0;
  for (const root of rootsToCheck) {
    const issues = await runStructureCheck(root, settings);
    totalIssues += issues.length;
    if (issues.length > 0) {
      for (const i of issues) {
        addLog('warn', `Structure: [${i.kind}] ${i.message}`);
      }
    }
  }

  if (totalIssues === 0) {
    addLog('info', 'Structure check: No issues found.');
  } else {
    addLog('warn', `Structure check: ${totalIssues} issue(s) found.`);
  }
}

function scheduleStructureCheck() {
  if (structureCheckTimer) clearInterval(structureCheckTimer);
  structureCheckTimer = null;
  const settings = getSettings();
  const interval = settings.structureCheckIntervalMs ?? 30 * 60 * 1000;
  if (interval > 0 && settings.outputPath?.trim()) {
    structureCheckTimer = setInterval(() => void runStructureCheckNow(), interval);
  }
}

let runManualForTray = () => Promise.resolve({ processed: 0, errors: 0 });

run({
  appName: APP_NAME,
  appId: 'io.github.taylorivanoff.cinetray',
  iconPath: path.join(__dirname, '..', 'resources', 'icon.png'),
  splashPath: path.join(__dirname, '..', 'resources', 'splash.html'),
  store: { instance: settingsStore },
  window: {
    html: path.join(__dirname, '..', 'renderer', 'index.html'),
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    minWidth: ABS_MIN_WINDOW.width,
    minHeight: ABS_MIN_WINDOW.height,
    defaultBounds: DEFAULT_WINDOW
  },
  dev: { entryModule: module },
  updater: { enabled: app.isPackaged },
  tray: {
    extraSections: () => [[
      { label: 'Process watch folders', click: () => void runManualForTray() },
      { type: 'separator' },
      { label: 'Show console', click: () => createOrShowLogWindow() }
    ]]
  },
  hooks: {
    getSettings: () => getSettings(),
    setSettings: (partial) => setSettings(partial),
    onSettingsChanged: () => {
      refreshWatcher();
      scheduleStructureCheck();
    },
    onReady: ({ showWindow }) => {
      initLogStreaming();
      refreshWatcher();
      scheduleStructureCheck();
      addLog(
        'info',
        'CineTray started. Auto processing enabled for new files (polling every 1m by default) and will only rename when files are ready.'
      );

      const settings = getSettings();
      if (!settings.apiKey?.trim() || settings.watchPaths.length === 0) {
        showWindow();
      }
    },
    onBeforeQuit: () => {
      if (structureCheckTimer) {
        clearInterval(structureCheckTimer);
        structureCheckTimer = null;
      }
      stopWatcher();
    },
    registerIpc: ({ showWindow, getMainWindow }) => {
      runManualForTray = async () => {
        showWindow();
        return runManualProcess();
      };

      ipcMain.handle('select-folder', async () => {
        const parent = getMainWindow();
        const opts = { properties: ['openDirectory'] };
        const result = parent && !parent.isDestroyed()
          ? await dialog.showOpenDialog(parent, opts)
          : await dialog.showOpenDialog(opts);
        return result.canceled ? null : result.filePaths[0];
      });
      ipcMain.handle('test-api-key', async (_e, apiKey) => testApiKey(apiKey));
      ipcMain.handle('open-console', () => {
        createOrShowLogWindow();
        return true;
      });
      ipcMain.handle('run-manual', async () => runManualProcess());
      ipcMain.handle('run-structure-check', () => runStructureCheckNow());
      ipcMain.handle('get-processed-records', () => getProcessedRecords());
    }
  }
});
