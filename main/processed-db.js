const Store = require('electron-store');

const MAX_RECORDS = 2000;
const KEY = 'processedRecords';

const store = new Store({
  defaults: { [KEY]: [] }
});

function addProcessedRecord(record) {
  const list = store.get(KEY) || [];
  list.unshift(record);
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
  store.set(KEY, list);
}

function getProcessedRecords() {
  return store.get(KEY) || [];
}

function wasProcessed(sourcePath) {
  const list = getProcessedRecords();
  return list.some((r) => r.sourcePath === sourcePath);
}

function removeProcessedRecord(sourcePath) {
  const list = getProcessedRecords();
  const next = list.filter((r) => r.sourcePath !== sourcePath);
  store.set(KEY, next);
}

function removeProcessedRecords(sourcePaths) {
  if (sourcePaths.length === 0) return;
  const set = new Set(sourcePaths);
  const list = getProcessedRecords();
  const next = list.filter((r) => !set.has(r.sourcePath));
  store.set(KEY, next);
}

function clearProcessedRecords() {
  store.set(KEY, []);
}

module.exports = {
  addProcessedRecord,
  getProcessedRecords,
  wasProcessed,
  removeProcessedRecord,
  removeProcessedRecords,
  clearProcessedRecords
};
