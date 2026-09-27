# Setup Guide

yt-next is a local, single-user Next.js application for browsing a CSV of
YouTube video IDs and downloading selected formats. It is designed to run on
the same machine where the downloaded files will be stored.

## Required Software

Install the following before starting the app:

- **Node.js 22.5 or newer**. The app uses Node's built-in `node:sqlite`
  module, so older Node versions are not supported.
- **pnpm**. This repository uses `pnpm-lock.yaml` as its lockfile.
- **yt-dlp** on your `PATH`. It is used to inspect available formats and to
  download media.
- **ffmpeg** on your `PATH`. It is needed for audio extraction and for merging
  separate video and audio streams. Some muxed downloads can work without it.

There are no separate database, Redis, or cloud storage services required.

## Install External Tools

Use the package manager appropriate for your operating system. Examples:

### macOS with Homebrew

```bash
brew install node pnpm yt-dlp ffmpeg
```

### Ubuntu or Debian

Install Node.js 22 or newer using the official Node.js installer or a version
manager such as `nvm`. Then install the system tools:

```bash
sudo apt update
sudo apt install ffmpeg
```

Install `pnpm` using Corepack after Node.js is available:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Install `yt-dlp` using the current instructions from the
[yt-dlp installation guide](https://github.com/yt-dlp/yt-dlp#installation),
then make sure the executable is available on `PATH`.

### Windows

Install Node.js 22 or newer, then install pnpm, yt-dlp, and ffmpeg using a
package manager such as `winget` or Chocolatey. Confirm that all executables
are available in a new PowerShell window.

## Verify Prerequisites

Run these commands from a terminal:

```bash
node --version
pnpm --version
yt-dlp --version
ffmpeg -version
```

The `node` command must report version `22.5` or newer. The other commands must
run without a `command not found` or equivalent error.

## Install and Start

From the project directory:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. Keep the
server bound to `localhost`; this app has no authentication or multi-user
isolation.

## Use the App

1. Prepare a CSV containing YouTube video IDs. The app accepts one ID per row
   and ignores duplicate IDs.
2. Upload the CSV and select **Fetch metadata**.
3. Search and filter the resulting catalog by title, channel, duration, views,
   music metadata, download status, or availability.
4. Select **Formats** on a video to inspect available downloads.
5. Choose best video, best audio, or a specific format. Downloads are written
   under `downloads/<video-id>/`.

## Local Data

The app creates these directories automatically and they are intentionally
gitignored:

- `data/yt-next.db`: saved CSV library in SQLite.
- `.cache/`: cached metadata, format information, and download registry.
- `downloads/`: downloaded media files.

The user running the server must have write access to the project directory.
Deleting `data/yt-next.db` removes the saved library. Deleting downloaded files
is safe; the download registry is reconciled when the downloads API is used.

## Production Run

To build and run the production version locally:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

The application is still intended for local use when started this way.
