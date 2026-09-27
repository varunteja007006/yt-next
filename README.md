# yt-next

A local, single-user YouTube library and downloader. The app imports a CSV
library, fetches metadata, and downloads selected video or audio formats.

This application is intended to run on one machine and is not configured for
multi-user or public deployment.

## Getting Started

### Prerequisites

- Node.js 22.5 or newer, with `node:sqlite` available.
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH`.
- `ffmpeg` on `PATH` for audio extraction and video merging.

### Install and run

Install dependencies with pnpm, then start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Keep the
server bound to `localhost`; it has no authentication or multi-user isolation.

For a production build:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

## Local Storage

Runtime data is stored beneath the project directory and is intentionally
gitignored:

- `data/yt-next.db` stores the saved CSV library in SQLite.
- `.cache/` stores fetched metadata caches.
- `downloads/` stores downloaded media and the download registry.

These directories must be writable by the user running the server. Deleting
the SQLite database removes the saved library. Download files are reconciled
with the registry when the downloads API is accessed.
