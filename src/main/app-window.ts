import { app, BrowserWindow } from 'electron';
import path from 'path';

let appWindow: BrowserWindow | null = null;

export function getAppWindow(): BrowserWindow | null {
  return appWindow;
}

export function createOrShowAppWindow(): void {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.show();
    appWindow.focus();
    return;
  }

  const appPath = app.getAppPath();
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');
  const appHtmlPath = path.join(appPath, 'src', 'renderer', 'app.html');

  appWindow = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'Tidy Tray',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  appWindow.on('closed', () => {
    appWindow = null;
  });

  appWindow.loadFile(appHtmlPath);
  appWindow.once('ready-to-show', () => appWindow?.show());
}

