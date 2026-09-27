<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository Guide

## Commands

- Use `pnpm`; `pnpm-lock.yaml` is the authoritative lockfile.
- Start local development with `pnpm dev` and open `http://localhost:3000`.
- Run checks in this order: `pnpm lint`, `pnpm exec tsc --noEmit`, then `pnpm build`.
- There is no test script or test suite currently configured; do not claim tests passed when only lint, typecheck, or build ran.

## Architecture

- This is a single-package Next App Router application, not a monorepo.
- `app/page.tsx` contains the client UI and upload/filter/download interactions.
- `app/api/*/route.ts` contains metadata, format, download, and saved-library endpoints.
- `lib/youtube.ts` fetches and caches metadata; `lib/formats.ts` invokes `yt-dlp` for format data; `lib/downloads.ts` owns the local download queue and registry; `lib/db.ts` owns the SQLite library record.
- Runtime state and storage are local to one Node process/machine: `.cache/`, `data/`, and `downloads/` are intentionally gitignored.
- The app is intended for local, single-user use. Keep it bound to `localhost`; it has no authentication or multi-user isolation.
- Download and format features require `yt-dlp`; audio extraction and video merging may require `ffmpeg`. The SQLite implementation requires a Node runtime that provides `node:sqlite`.

## Workflow

- Preserve the generated Next.js instruction block above; `next dev` may regenerate it.
- Before changing Next.js behavior or APIs, read the relevant guide under `node_modules/next/dist/docs/` as required by the generated block.
- Keep API validation and client behavior aligned when changing request or response shapes; shared API schemas/types do not currently exist.
- For a new work item, create `docs/todos/<title>-<YYYY-MM-DD>.md`, then add or update its filename and completion percentage in `docs/todos/todo.md`.
- Keep todo completion percentages accurate as work progresses.
