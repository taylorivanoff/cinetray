const fs = require('fs/promises');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canOpenForRead(filePath) {
  try {
    const fh = await fs.open(filePath, 'r');
    await fh.close();
    return true;
  } catch {
    return false;
  }
}

async function waitForFileReady(filePath, opts) {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const intervalMs = opts?.intervalMs ?? 1_000;

  const start = Date.now();
  let prevSize = null;
  let stableReads = 0;

  while (Date.now() - start < timeoutMs) {
    const canRead = await canOpenForRead(filePath);
    if (!canRead) {
      prevSize = null;
      stableReads = 0;
      await delay(intervalMs);
      continue;
    }

    try {
      const st = await fs.stat(filePath);
      if (prevSize != null && st.size === prevSize) {
        stableReads++;
      } else {
        stableReads = 0;
      }
      prevSize = st.size;

      if (stableReads >= 1) return true;
    } catch {
      prevSize = null;
      stableReads = 0;
    }

    await delay(intervalMs);
  }

  return false;
}

module.exports = { waitForFileReady };
