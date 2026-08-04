import { app, ipcMain, dialog, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { createTray, destroyTray } from './tray';
import { createSettingsWindow, showSettingsWindow, getSettingsWindow } from './settings-window';
import { createOrShowLogWindow, getLogWindow } from './log-window';
import { initLogStreaming } from './log-window';
import { getSettings, setSettings } from './store';
import { startWatcher, stopWatcher } from './watcher';
import { processFile } from './renamer';
import { getFilesToProcess } from './manual-run';
import { testApiKey } from './tmdb';
import { addLog } from './logger';
import { addProcessedRecord, removeProcessedRecords, wasProcessed, getProcessedRecords } from './processed-db';
import { runStructureCheck } from './structure-checker';
import { createOrShowAppWindow } from './app-window';
import { waitForFileReady } from './file-ready';
import type { AppSettings } from '../types';

let isQuitting = false;
let splashWindow: BrowserWindow | null = null;
let structureCheckTimer: ReturnType<typeof setInterval> | null = null;

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
    splashWindow = null;
  }
}

function createSplash(splashPath: string): void {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { nodeIntegration: false },
  });
  splashWindow.loadFile(splashPath);
  splashWindow.center();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createOrShowAppWindow();
  });

  if (!app.isPackaged) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('electron-reloader')(module, {
        watchRenderer: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/package-lock.json'],
      });
    } catch {
      // electron-reloader is a devDependency; ignore if missing.
    }
  }
}

app.on('before-quit', () => {
  isQuitting = true;
  if (structureCheckTimer) { clearInterval(structureCheckTimer); structureCheckTimer = null; }
  stopWatcher();
  closeSplash();
  const win = getSettingsWindow();
  if (win && !win.isDestroyed()) win.destroy();
  const logWin = getLogWindow();
  if (logWin && !logWin.isDestroyed()) logWin.destroy();
  destroyTray();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initLogStreaming();
  const appPath = app.getAppPath();
  const iconPath = path.join(appPath, 'resources', 'icon.png');
  const splashPath = path.join(appPath, 'resources', 'splash.html');
  createSplash(splashPath);

  async function runManualProcess(): Promise<{ processed: number; errors: number }> {
    // Manual sync only: open the App page so embedded Console shows `src → dest` changes.
    createOrShowAppWindow();
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

    // Pre-scan for existing recursive/invalid structure so you can see what's already in place.
    const rootsToCheck = settings.outputPath?.trim() ? [settings.outputPath.trim()] : settings.watchPaths;
    for (const root of rootsToCheck) {
      const issues = await runStructureCheck(root, settings);
      if (issues.length > 0) {
        addLog('warn', `Pre-scan (${root}): ${issues.length} structure issue(s) found.`);
        for (const i of issues.slice(0, 5)) addLog('warn', `Structure: [${i.kind}] ${i.message}`);
        if (issues.length > 5) addLog('warn', `...and ${issues.length - 5} more.`);

        // Auto-fix: if we detected recurring folder paths, ensure the affected media files
        // are eligible to be processed again in this manual run.
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
              year: result.year,
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

  const inFlight = new Set<string>();

  function refreshWatcher(): void {
    const settings = getSettings();
    stopWatcher();
    startWatcher(settings, async (filePath) => {
      if (inFlight.has(filePath)) return;
      inFlight.add(filePath);
      try {
        // Another event may have processed it already.
        if (wasProcessed(filePath)) {
          addLog('info', `Skipped (already processed): ${filePath}`);
          return;
        }

        // Auto processing only when file is not locked and is fully written.
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
              year: result.year,
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

  async function runStructureCheckNow(): Promise<void> {
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

  function scheduleStructureCheck(): void {
    if (structureCheckTimer) clearInterval(structureCheckTimer);
    structureCheckTimer = null;
    const settings = getSettings();
    const interval = settings.structureCheckIntervalMs ?? 30 * 60 * 1000;
    if (interval > 0 && settings.outputPath?.trim()) {
      structureCheckTimer = setInterval(() => void runStructureCheckNow(), interval);
    }
  }

  function getTrayMenuTemplate() {
    return [
      { label: 'Open App', click: () => createOrShowAppWindow() },
      { type: 'separator' as const },
      { label: 'Show Console', click: () => createOrShowLogWindow() },
      { label: 'Quit', click: () => app.quit() },
    ];
  }

  createTray(iconPath, getTrayMenuTemplate, () => {
    createOrShowAppWindow();
  });

  createSettingsWindow(() => {}, () => {
    closeSplash();
    const settings = getSettings();
    if (!settings.apiKey?.trim() || settings.watchPaths.length === 0) {
      createOrShowAppWindow();
    }
  });
  setTimeout(closeSplash, 5000);

  ipcMain.handle('get-settings', () => getSettings());
  ipcMain.handle('set-settings', (_e, settings: Partial<AppSettings>) => {
    setSettings(settings);
    // Restart watcher so new settings take effect.
    refreshWatcher();
    scheduleStructureCheck();
  });
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('test-api-key', async (_e, apiKey: string) => testApiKey(apiKey));
  ipcMain.handle('open-console', () => {
    createOrShowLogWindow();
    return true;
  });
  ipcMain.handle('open-settings', () => {
    const win = createSettingsWindow(() => {});
    win.show();
    win.focus();
    return true;
  });
  ipcMain.handle('run-manual', async () => runManualProcess());
  ipcMain.handle('run-structure-check', () => runStructureCheckNow());
  ipcMain.handle('get-processed-records', () => getProcessedRecords());

  scheduleStructureCheck();
  refreshWatcher();
  addLog(
    'info',
    'Tidy Tray started. Auto processing enabled for new files (polling every 1m by default) and will only rename when files are ready.'
  );
});

app.on('window-all-closed', () => {
  if (!isQuitting) {
    closeSplash();
    (app as unknown as { dock?: { hide?: () => void } }).dock?.hide?.();
  }
});
