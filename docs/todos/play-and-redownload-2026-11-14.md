# Play & Re-download Completed Files

## Goal

- Serve completed downloads to the browser so they can be played/tested, and let the user delete a completed download to free space or re-download it.

## Tasks

- [x] Export `DOWNLOADS_DIR` from `lib/downloads.ts`.
- [x] Add `GET /api/downloads/file` route: validates `videoId`/`formatKey`, 404s unless the entry is done with an existing file, rejects paths outside the downloads dir, maps extension to Content-Type, and supports single-range requests (206) for seeking.
- [x] Add icon-only Play (opens file in a new tab) and Delete (POSTs `action:"remove"`, updates registry) actions to the done-status chips, with double-click guard.
- [x] Per-format download buttons re-enable automatically after delete via the registry update.

## Follow-ups (same day)

- [x] One-click redownload: `DownloadEntry` records `mode`/`itag` (post-resolution, optional so legacy entries load); done chips show a Redownload button (RotateCcw) for entries with `mode` — removes the entry then re-starts with the recorded mode/itag/label.
- [x] Inline player: Play is now a toggle that renders an in-row `<audio controls autoPlay>` (m4a/mp3/opus/ogg/weba) or `<video controls autoPlay>` under the status chips, one player at a time, with a close button; served through the range-capable file route.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
