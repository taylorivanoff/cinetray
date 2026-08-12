const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getLogs, setOnNewEntry } = require('./logger');

let logWindow = null;

const logSinks = new Set();
let streamingInitialized = false;

function sendToSinks(channel, ...args) {
  for (const sink of logSinks) {
    if (!sink.isDestroyed()) sink.send(channel, ...args);
  }
}

function initLogStreaming() {
  if (streamingInitialized) return;
  streamingInitialized = true;

  setOnNewEntry((entry) => {
    sendToSinks('log', entry);
  });

  ipcMain.on('log-request', (event) => {
    const sender = event.sender;
    logSinks.add(sender);
    sender.once('destroyed', () => logSinks.delete(sender));
    sender.send('log-init', getLogs());
  });
}

function getLogWindow() {
  return logWindow;
}

function createOrShowLogWindow() {
  initLogStreaming();
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.show();
    logWindow.focus();
    return;
  }

  const preloadPath = path.join(__dirname, '..', 'preload', 'log-preload.js');
  const logHtmlPath = path.join(__dirname, '..', 'renderer', 'log.html');

  logWindow = new BrowserWindow({
    width: 700,
    height: 400,
    minWidth: 400,
    minHeight: 200,
    title: 'CineTray – Console',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  logWindow.on('closed', () => {
    logWindow = null;
  });

  logWindow.loadFile(logHtmlPath);
}

module.exports = {
  initLogStreaming,
  getLogWindow,
  createOrShowLogWindow
};
