const fs = require('fs/promises');
const path = require('path');
const tmdb = require('./tmdb');
const { parseFilename } = require('./parser');

function getWatchRootForFile(filePath, watchPaths) {
  const absFile = path.resolve(filePath);
  let best = null;

  for (const watchPath of watchPaths) {
    const trimmed = watchPath?.trim();
    if (!trimmed) continue;
    const absWatch = path.resolve(trimmed);
    const prefix = absWatch.endsWith(path.sep) ? absWatch : absWatch + path.sep;

    if (absFile === absWatch || absFile.startsWith(prefix)) {
      if (!best || absWatch.length > best.length) best = absWatch;
    }
  }

  return best;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'Unknown';
}

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function applyTemplate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), String(v));
  }
  return out;
}

async function removeEmptyParentDirs(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  while (current.startsWith(stop) && current !== stop) {
    try {
      const entries = await fs.readdir(current);
      if (entries.length > 0) return;
      await fs.rmdir(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

async function processFile(filePath, settings) {
  const parsed = parseFilename(filePath);
  if (!parsed) {
    return { success: false, error: 'Could not parse filename' };
  }

  const apiKey = settings.apiKey?.trim();
  if (!apiKey) return { success: false, error: 'TMDB API key not set' };

  const baseOut =
    settings.outputPath?.trim() ||
    getWatchRootForFile(filePath, settings.watchPaths) ||
    path.dirname(filePath);

  if (parsed.type === 'tv') {
    const show = await tmdb.searchTv(apiKey, parsed.title);
    if (!show) return { success: false, error: `No TV show found: ${parsed.title}` };

    const episodes = await tmdb.getTvSeason(apiKey, show.id, parsed.season);
    const episodeTitle =
      episodes?.find((e) => e.episode_number === parsed.episode)?.name ?? `Episode ${parsed.episode}`;

    const showName = sanitizeFileName(show.name);
    const fullRelative = applyTemplate(settings.tvTemplate, {
      show: showName,
      s: pad(parsed.season),
      e: pad(parsed.episode),
      title: sanitizeFileName(episodeTitle),
      ext: parsed.extension
    });
    const destPath = path.join(baseOut, fullRelative);
    const destDir = path.dirname(destPath);

    if (settings.dryRun) {
      return { success: true, destPath, type: 'tv', showName, season: parsed.season, episode: parsed.episode };
    }

    await fs.mkdir(destDir, { recursive: true });
    let finalPath = destPath;
    let counter = 1;
    while (true) {
      try {
        await fs.access(finalPath);
        const ext = path.extname(destPath);
        const base = destPath.slice(0, -ext.length);
        finalPath = `${base} (${counter})${ext}`;
        counter++;
      } catch {
        break;
      }
    }
    if (path.resolve(filePath) !== path.resolve(finalPath)) {
      await fs.rename(filePath, finalPath);
      await removeEmptyParentDirs(path.dirname(filePath), baseOut);
    }
    return { success: true, destPath: finalPath, type: 'tv', showName, season: parsed.season, episode: parsed.episode };
  }

  const movie = await tmdb.searchMovie(apiKey, parsed.title);
  if (!movie) return { success: false, error: `No movie found: ${parsed.title}` };

  const year = parsed.year ?? (movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : 0);
  const title = sanitizeFileName(movie.title);
  const destFileName = applyTemplate(settings.movieTemplate, {
    title,
    year: year || 'Unknown',
    ext: parsed.extension
  });
  const destPath = path.join(baseOut, destFileName);

  if (settings.dryRun) {
    return { success: true, destPath, type: 'movie', movieTitle: title, year: year || undefined };
  }

  await fs.mkdir(baseOut, { recursive: true });
  let finalPath = destPath;
  let counter = 1;
  while (true) {
    try {
      await fs.access(finalPath);
      const ext = path.extname(destPath);
      const base = destPath.slice(0, -ext.length);
      finalPath = `${base} (${counter})${ext}`;
      counter++;
    } catch {
      break;
    }
  }
  if (path.resolve(filePath) !== path.resolve(finalPath)) {
    await fs.rename(filePath, finalPath);
    await removeEmptyParentDirs(path.dirname(filePath), baseOut);
  }
  return { success: true, destPath: finalPath, type: 'movie', movieTitle: title, year: year || undefined };
}

module.exports = { processFile };
