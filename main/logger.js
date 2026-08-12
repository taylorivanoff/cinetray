const MAX_ENTRIES = 1000;

const entries = [];
let onNewEntry = null;

function timestamp() {
  return new Date().toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function addLog(level, message) {
  const entry = { time: timestamp(), level, message };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  onNewEntry?.(entry);
}

function getLogs() {
  return [...entries];
}

function setOnNewEntry(cb) {
  onNewEntry = cb;
}

module.exports = {
  addLog,
  getLogs,
  setOnNewEntry
};
