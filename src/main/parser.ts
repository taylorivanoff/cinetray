import path from 'path';
import type { ParsedFile } from '../types';

const TV_PATTERNS = [
  // S01E05, s01e05, 1x05
  /^(.+?)[.\s_-]+[sS]?(\d{1,2})[xXeE](\d{1,2})(?:[.\s_-]|$)/i,
  /^(.+?)[.\s_-]+(\d{1,2})x(\d{1,2})(?:[.\s_-]|$)/i,
];

const MOVIE_YEAR_PATTERN = /^(.+?)[.\s_-]+((19|20)\d{2})(?:[.\s_-]|$)/;

function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[.\s_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFilename(filePath: string): ParsedFile | null {
  const basename = path.basename(filePath, path.extname(filePath));
  const extension = path.extname(filePath).slice(1).toLowerCase();

  // Try TV patterns first
  for (const re of TV_PATTERNS) {
    const m = basename.match(re);
    if (m) {
      const title = sanitizeTitle(m[1]);
      const season = parseInt(m[2], 10);
      const episode = parseInt(m[3], 10);
      if (title && !isNaN(season) && !isNaN(episode)) {
        return { type: 'tv', title, season, episode, extension };
      }
    }
  }

  // Try movie (year in filename)
  const yearMatch = basename.match(MOVIE_YEAR_PATTERN);
  if (yearMatch) {
    const title = sanitizeTitle(yearMatch[1]);
    const year = parseInt(yearMatch[2], 10);
    if (title && year >= 1900 && year <= 2100) {
      return { type: 'movie', title, year, extension };
    }
  }

  // No year: still treat as movie with unknown year (TMDB search can disambiguate)
  const title = sanitizeTitle(basename);
  if (title.length >= 2) {
    return { type: 'movie', title, extension };
  }

  return null;
}
