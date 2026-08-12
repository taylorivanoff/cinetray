const TMDB_BASE = 'https://api.themoviedb.org/3';

const cache = new Map();

function cacheKey(prefix, ...parts) {
  return `${prefix}:${parts.join(':')}`;
}

async function searchMovie(apiKey, query) {
  const key = cacheKey('movie', query);
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const first = data.results?.[0] ?? null;
  if (first) cache.set(key, first);
  return first;
}

async function searchTv(apiKey, query) {
  const key = cacheKey('tv', query);
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/search/tv?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const first = data.results?.[0] ?? null;
  if (first) cache.set(key, first);
  return first;
}

async function getTvSeason(apiKey, tvId, seasonNumber) {
  const key = cacheKey('season', String(tvId), String(seasonNumber));
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const episodes = data.episodes ?? null;
  if (episodes) cache.set(key, episodes);
  return episodes;
}

async function testApiKey(apiKey) {
  if (!apiKey.trim()) return false;
  const url = `${TMDB_BASE}/configuration?api_key=${encodeURIComponent(apiKey.trim())}`;
  const res = await fetch(url);
  return res.ok;
}

module.exports = {
  searchMovie,
  searchTv,
  getTvSeason,
  testApiKey
};
