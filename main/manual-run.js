const fs = require('fs/promises');
const path = require('path');

async function findMediaFiles(dir, exts, maxDepth, currentDepth) {
  if (currentDepth > maxDepth) return [];
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await findMediaFiles(full, exts, maxDepth, currentDepth + 1);
      out.push(...sub);
    } else if (e.isFile()) {
      const ext = e.name.split('.').pop()?.toLowerCase();
      if (ext && exts.has(ext)) out.push(full);
    }
  }
  return out;
}

async function getFilesToProcess(settings) {
  const exts = new Set(settings.mediaExtensions.map((e) => e.toLowerCase()));
  const all = [];
  for (const watchPath of settings.watchPaths) {
    const files = await findMediaFiles(watchPath, exts, 5, 0);
    all.push(...files);
  }
  return all;
}

module.exports = { getFilesToProcess };
