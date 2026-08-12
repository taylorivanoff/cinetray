# CineTray — Automatic Movie & TV File Renamer

[![Release](https://img.shields.io/github/v/release/taylorivanoff/cinetray)](https://github.com/taylorivanoff/cinetray/releases)
[![Downloads](https://img.shields.io/github/downloads/taylorivanoff/cinetray/total)](https://github.com/taylorivanoff/cinetray/releases)
[![License](https://img.shields.io/github/license/taylorivanoff/cinetray)](LICENSE)

**CineTray** is a cross-platform **media file renamer** that automatically organizes movie and TV show files using [The Movie Database (TMDB)](https://www.themoviedb.org). It runs from the system tray, watches download folders, matches filenames to TMDB metadata, and moves files into Plex-compatible show/season or movie folders — a lightweight FileBot alternative for Plex, Jellyfin, and Kodi libraries.

One combined app window covers sync actions, settings, and a live console. Supports automatic watching and one-click manual processing.

## Features

- Combined app window: console, settings, and sync actions in one place
- Status badge in the titlebar (Watching, Dry run, No API key, No folders, …)
- **Process now** and **Check structure** from the titlebar
- Toggleable **Debug** log strip (like GhStats)
- Tray icon with **Process watch folders** and **Show console**
- Close hides to tray (Quit from tray menu)
- Auto processing enabled by default (watcher + 60s polling)
- Manual processing for backfills and cleanup
- Non-locked file safety: waits until files are readable and size-stable
- Template-based TV and movie output paths
- Dry run mode: preview changes without moving files
- Recurring-folder recovery: detects recursive paths, reprocesses affected files

## Screenshots

Main app window:

![CineTray main window](docs/images/main-window.png)

## What It Does

- Watches your incoming folders for media files (`.mkv`, `.mp4`, `.avi`, etc.)
- Detects TV episodes and movies from filenames
- Looks up proper titles/episode names in TMDB
- Renames/moves files using your templates
- Logs every action in the embedded console

Examples:

- TV: `Show Name/Season 01/Show Name - S01E05 - Episode Title.mkv`
- Movie: `Movie Name (2024).mkv`

## Requirements

- A free [TMDB API key](https://www.themoviedb.org/settings/api)

## Installation

### Windows

1. Download the latest installer from [Releases](https://github.com/taylorivanoff/cinetray/releases)
2. Run the installer and follow the prompts

### macOS

1. Download the `.dmg` from [Releases](https://github.com/taylorivanoff/cinetray/releases) and drag **CineTray** to Applications
2. macOS may say the app is “damaged” — that is Gatekeeper blocking an unsigned download, not a bad file. Go to System Preferences → Security & Privacy, then “Open anyway”.

## Development

```bash
npm install
npm start
```

Or with Bun:

```bash
bun install
bun start
```

### Building

```bash
npm run release
```

## Usage

1. Launch CineTray from the tray icon (the window opens automatically on first run if the API key or watch folders are missing)
2. Add your TMDB API key and click **Test**
3. Add one or more watch folders
4. Optionally set an output folder (leave blank to organize from watch roots)
5. Review templates and click **Save settings**
6. Click **Process now** for a manual scan, or let the watcher handle new files
7. Click **Debug** to show or hide the compact log strip above the console
8. Use **Check structure** to scan output folders for naming/layout issues

### Processing modes

**Automatic** — triggered by new/changed files in watch folders. Uses polling (default 60 seconds). Skips files that appear locked/in-progress and retries on later events.

**Manual** — runs a deeper scan of watch folders. Useful for backfills and cleanup. Performs pre-scan structure checks and logs findings.

## Filename Detection

CineTray parses common patterns:

- TV:
  - `Show.Name.S01E05.*`
  - `Show.Name.1x05.*`
  - `Show Name s01e05 ...`
- Movies:
  - `Movie.Name.2024.*`
  - similar names containing a 4-digit year

The parsed title is used as the TMDB query.

## Templates

Default TV template:

`{show}/Season {s}/{show} - S{s}E{e} - {title}.{ext}`

Default movie template:

`{title} ({year}).{ext}`

Supported placeholders:

- TV: `{show}`, `{s}`, `{e}`, `{title}`, `{ext}`
- Movie: `{title}`, `{year}`, `{ext}`

## Tech Stack

- [Electron](https://www.electronjs.org/)
- [electron-tray-base](https://github.com/taylorivanoff/electron-tray-base) — tray, window, splash, settings IPC
- [TMDB API](https://www.themoviedb.org/documentation/api)
- [chokidar](https://github.com/paulmillr/chokidar)
- [electron-store](https://github.com/sindresorhus/electron-store)

## Keywords

movie file renamer, TV show renamer, TMDB media organizer, Plex file naming, Jellyfin media sorter, download folder organizer, system tray media tools, FileBot alternative, automatic media renamer, download folder watcher

## Attribution

This product uses the [TMDB API](https://www.themoviedb.org/documentation/api) but is not endorsed or certified by TMDB.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT. See [LICENSE](LICENSE).
