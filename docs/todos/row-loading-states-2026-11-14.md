# Loading States & Layout-Shift (CLS) Reductions

## Goal

- Give every in-flight client action visible feedback (spinners/labels) and stop the results table from collapsing/jumping while data loads or registry chips appear/disappear.

## Tasks

- [x] Metadata skeleton: while `loading && !result`, render a skeleton table in the results area — same 8-column header as the found-video table, 6 `animate-pulse` placeholder rows (thumbnail `h-8 w-14`, title bars, channel/duration/views/published bars, icon square, Formats-button block). Nothing renders after unmount (plain derived render, no effects).
- [x] Per-download pending state: new `pendingDownloads: Set<string>` keyed `${videoId}:${formatKeyOrMode}` (itag downloads → `itag-<itag>`, best modes → the mode name since the server resolves the itag). `requestDownload` adds the key before the fetch and removes it in `finally`. Buttons show a `Loader2 size-* animate-spin` + "Starting…" while pending; itag chips disable and swap their retry icon for a spinner.
- [x] FormatPanel: accepts a `pending` Set prop; best-mode buttons show "Starting…" + spinner during the pending window (previously they stayed idle until the registry poll caught up).
- [x] Batch download: bottom-bar buttons show `Loader2 animate-spin` + "Starting…" while `batchLoading` (still disabled).
- [x] FormatPanel loading skeleton: replaced the "Loading formats…" text with a two-group (Video/Audio) skeleton chip grid of pulsing rounded blocks roughly matching chip size, so expanding a row doesn't jump height twice.
- [x] Chips container stability: renders whenever the video has ANY registry entries (`allEntries.length > 0`), including all-`failed` sets — failed entries now render as rose chips with a Retry (`RotateCcw` → `redownloadEntry`, when `entry.mode` exists) and Delete icon, `title` = entry error. Container gets `min-h-[1.25rem]` so chip-count changes don't collapse the row. No space reserved for rows that never had downloads.
- [x] Icon-button spinners: row trash (`deletingVideoId === v.id`), not-found-row trash (`deletingVideoId === id`), done-chip redo/delete and failed-chip retry/delete (`removingKey === key`) swap to `Loader2 animate-spin` at the same size while in flight, staying disabled as before.

## Verification

- `pnpm lint` — pass
- `pnpm exec tsc --noEmit` — pass
- `pnpm build` — pass
- No test suite exists; not run.
