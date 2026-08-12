#!/usr/bin/env node
/**
 * Long-running JSON-lines sidecar for CineTray's media pipeline (watcher,
 * renamer, TMDB lookups, structure checks). Tauri owns tray/window/settings;
 * this process owns everything that needs Node (chokidar, fs, fetch).
 *
 * Protocol (stdin -> stdout, one JSON object per line):
 *   requests:  { "id": 1, "op": "init", "dataDir": "...", "settings": {...} }
 *   responses: { "id": 1, "ok": true, ... }
 *   events:    { "type": "log", "entry": { "time", "level", "message" } }
 */
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { startWatcher, stopWatcher } = require('../main/watcher.js');
const { processFile } = require('../main/renamer.js');
const { getFilesToProcess } = require('../main/manual-run.js');
const { testApiKey } = require('../main/tmdb.js');
const { runStructureCheck } = require('../main/structure-checker.js');
const { waitForFileReady } = require('../main/file-ready.js');
const { addLog, getLogs, setOnNewEntry } = require('../main/logger.js');
const { FsStore } = require('./fs-store.js');

const MAX_PROCESSED_RECORDS = 2000;

let settings = null;
let processedStore = null;
let structureCheckTimer = null;
const inFlight = new Set();

function reply(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

setOnNewEntry((entry) => {
  reply({ type: 'log', entry });
});

function getProcessedRecords() {
  return processedStore ? processedStore.get('records', []) : [];
}

function wasProcessed(sourcePath) {
  return getProcessedRecords().some((r) => r.sourcePath === sourcePath);
}

function addProcessedRecord(record) {
  if (!processedStore) return;
  const list = getProcessedRecords();
  list.unshift(record);
  if (list.length > MAX_PROCESSED_RECORDS) list.length = MAX_PROCESSED_RECORDS;
  processedStore.set('records', list);
}

function removeProcessedRecords(sourcePaths) {
  if (!processedStore || sourcePaths.length === 0) return;
  const set = new Set(sourcePaths);
  const next = getProcessedRecords().filter((r) => !set.has(r.sourcePath));
  processedStore.set('records', next);
}

function recordFromResult(filePath, result) {
  return {
    sourcePath: filePath,
    destPath: result.destPath,
    processedAt: new Date().toISOString(),
    type: result.type ?? (result.showName ? 'tv' : 'movie'),
    showName: result.showName,
    season: result.season,
    episode: result.episode,
    movieTitle: result.movieTitle,
    year: result.year
  };
}

async function runManualProcess() {
  addLog('info', '=== Manual run started ===');
  if (!settings?.apiKey?.trim()) {
    addLog('error', 'Manual run: TMDB API key not set.');
    return { processed: 0, errors: 1 };
  }
  if (!settings.watchPaths || settings.watchPaths.length === 0) {
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
      const result = await processFile(filePath, settings);
      if (result.success && result.destPath) {
        const verb = settings.dryRun ? 'Would rename' : 'Renamed';
        addLog('info', `${verb}: ${filePath} → ${result.destPath}`);
        if (!settings.dryRun) addProcessedRecord(recordFromResult(filePath, result));
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
  stopWatcher();
  if (!settings || !settings.watchPaths || settings.watchPaths.length === 0) return;

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

      const result = await processFile(filePath, settings);
      if (result.success && result.destPath) {
        const verb = settings.dryRun ? 'Would rename' : 'Renamed';
        addLog('info', `${verb}: ${filePath} → ${result.destPath}`);
        if (!settings.dryRun) addProcessedRecord(recordFromResult(filePath, result));
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
  if (!settings) return;
  const rootsToCheck = settings.outputPath?.trim()
    ? [settings.outputPath.trim()]
    : (settings.watchPaths || []).filter((p) => p?.trim());

  if (rootsToCheck.length === 0) {
    addLog('warn', 'Structure check: No output or watch folders configured.');
    return;
  }

  addLog('info', `Structure check running on ${rootsToCheck.length} folder(s)...`);
  let totalIssues = 0;
  for (const root of rootsToCheck) {
    const issues = await runStructureCheck(root, settings);
    totalIssues += issues.length;
    for (const i of issues) addLog('warn', `Structure: [${i.kind}] ${i.message}`);
  }

  if (totalIssues === 0) addLog('info', 'Structure check: No issues found.');
  else addLog('warn', `Structure check: ${totalIssues} issue(s) found.`);
}

function scheduleStructureCheck() {
  if (structureCheckTimer) clearInterval(structureCheckTimer);
  structureCheckTimer = null;
  if (!settings) return;
  const interval = settings.structureCheckIntervalMs ?? 30 * 60 * 1000;
  if (interval > 0 && settings.outputPath?.trim()) {
    structureCheckTimer = setInterval(() => void runStructureCheckNow(), interval);
  }
}

async function handle(msg) {
  const op = msg?.op;
  switch (op) {
    case 'init': {
      settings = msg.settings || {};
      const dataDir = String(msg.dataDir || '');
      if (dataDir) {
        processedStore = new FsStore(path.join(dataDir, 'cinetray-processed.json'), { records: [] });
      }
      refreshWatcher();
      scheduleStructureCheck();
      addLog(
        'info',
        'CineTray started. Auto processing enabled for new files and will only rename when files are ready.'
      );
      return { ok: true };
    }
    case 'update-settings': {
      settings = msg.settings || settings || {};
      refreshWatcher();
      scheduleStructureCheck();
      return { ok: true };
    }
    case 'run-manual': {
      const result = await runManualProcess();
      return { ok: true, ...result };
    }
    case 'run-structure-check': {
      await runStructureCheckNow();
      return { ok: true };
    }
    case 'test-api-key': {
      const valid = await testApiKey(String(msg.apiKey || ''));
      return { ok: true, valid };
    }
    case 'get-logs': {
      return { ok: true, logs: getLogs() };
    }
    case 'shutdown': {
      stopWatcher();
      if (structureCheckTimer) {
        clearInterval(structureCheckTimer);
        structureCheckTimer = null;
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown op: ${op}` };
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  const trimmed = String(line || '').trim();
  if (!trimmed) continue;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    continue;
  }

  const id = msg?.id;
  try {
    const result = await handle(msg);
    reply({ id, ...result });
  } catch (err) {
    reply({ id, ok: false, error: err?.message || String(err) });
  }

  if (msg?.op === 'shutdown') {
    process.exit(0);
  }
}

// Keep a reference so bundlers don't drop __dirname in some setups.
void __dirname;
