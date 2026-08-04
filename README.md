# Tidy Tray - Automatic Movie & TV File Organizer for Windows

[![Release](https://img.shields.io/github/v/release/taylorivanoff/tidy-tray)](https://github.com/taylorivanoff/tidy-tray/releases)
[![Downloads](https://img.shields.io/github/downloads/taylorivanoff/tidy-tray/total)](https://github.com/taylorivanoff/tidy-tray/releases)
[![License](https://img.shields.io/github/license/taylorivanoff/tidy-tray)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/taylorivanoff)

**Tidy Tray** is a Windows **media file organizer** that renames and sorts movie and TV show files using [The Movie Database (TMDB)](https://www.themoviedb.org). It runs from the system tray, watches download folders, matches filenames to TMDB metadata, and moves files into clean show/season or movie folders - like a lightweight local alternative to manual renaming tools.

One combined app page covers actions, settings, and a live console. Supports automatic watching and one-click manual processing.

---

## What It Does

- Watches your incoming folders for media files (`.mkv`, `.mp4`, `.avi`, etc.)
- Detects TV episodes and movies from filenames
- Looks up proper titles/episode names in TMDB
- Renames/moves files using your templates
- Logs every action in the embedded console

Examples:
- TV: `Show Name/Season 01/Show Name - S01E05 - Episode Title.mkv`
- Movie: `Movie Name (2024).mkv`

---

## Key Features

- **Combined app page**: actions, settings, and live console in one place
- **Tray workflow**: click tray icon to open the app quickly
- **Auto processing enabled by default**
  - watcher enabled by default
  - polling enabled by default
  - default polling interval is **60 seconds**
- **Manual processing**: run “Process watch folders now” any time
- **Non-locked file safety**: auto processing waits until files are readable and size-stable (helps avoid files still being copied)
- **Template-based output**: customize TV and movie naming structure
- **Dry run mode**: preview changes without moving files
- **Recurring-folder recovery**
  - detects recursive path issues
  - reprocesses affected files
  - removes empty leftover folders after moves

---

## Quick Start

### 1) Get a TMDB API key (free)

1. Create an account at [themoviedb.org](https://www.themoviedb.org)
2. Open **Settings -> API**
3. Request a developer API key
4. Copy your **API Key (v3 auth)**

### 2) Install and run

From source:

```bash
git clone https://github.com/taylorivanoff/tidy-tray.git
cd tidy-tray
npm install
npm start
```

Windows package:

```bash
npm run release
```

Installer/output files are created under `dist/`.

### 3) Configure in app

1. Click the tray icon to open Tidy Tray
2. Add your TMDB API key and test it
3. Add one or more watch folders
4. Optionally set an output folder (leave blank to organize from watch roots)
5. Review templates and save

---

## Processing Modes

### Automatic mode

- Triggered by new/changed files in watch folders
- Uses polling (default 60 seconds)
- Skips files that appear locked/in-progress and retries on later events

### Manual mode

- Runs a deeper scan of watch folders
- Useful for backfills and cleanup
- Performs pre-scan structure checks and logs findings

---

## Filename Detection

Tidy Tray parses common patterns:

- TV:
  - `Show.Name.S01E05.*`
  - `Show.Name.1x05.*`
  - `Show Name s01e05 ...`
- Movies:
  - `Movie.Name.2024.*`
  - similar names containing a 4-digit year

The parsed title is used as the TMDB query.

---

## Templates

Default TV template:

`{show}/Season {s}/{show} - S{s}E{e} - {title}.{ext}`

Default movie template:

`{title} ({year}).{ext}`

Supported placeholders:

- TV: `{show}`, `{s}`, `{e}`, `{title}`, `{ext}`
- Movie: `{title}`, `{year}`, `{ext}`

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm start` | Build and run the app |
| `npm run build` | Compile TypeScript |
| `npm run release` | Build Windows installer (NSIS) |

---

## Tech Stack

- [Electron](https://www.electronjs.org/)
- [TMDB API](https://www.themoviedb.org/documentation/api)
- [chokidar](https://github.com/paulmillr/chokidar)
- [electron-store](https://github.com/sindresorhus/electron-store)

---

## Keywords

movie file organizer, TV show renamer, TMDB media organizer, Plex file naming, Jellyfin media sorter, download folder organizer, Windows tray media tools

---

## Attribution

This product uses the [TMDB API](https://www.themoviedb.org/documentation/api) but is not endorsed or certified by TMDB.

---

## License

MIT. See [LICENSE](LICENSE).
