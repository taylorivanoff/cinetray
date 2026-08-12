const fs = require('fs');
const path = require('path');

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Minimal JSON-file-backed key/value store (no electron-store dependency). */
class FsStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.data = { ...defaults, ...readJsonFile(filePath, {}) };
  }

  get(key, fallback) {
    return this.data[key] !== undefined ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    writeJsonFile(this.filePath, this.data);
  }
}

module.exports = { readJsonFile, writeJsonFile, FsStore };
