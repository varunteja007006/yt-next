# Delete a Video Row from the Library

## Goal

- Let the user remove a single video (and all of its duplicate CSV rows) from the saved library, directly from the table row, without re-uploading or resetting the whole library.

## Tasks

- [x] Add `removeVideoRows(csv, videoId)` to `lib/csv.ts`: finds the id column (`Video ID`/`VideoId`/`video_id`), drops every matching row (duplicates included), re-serializes with the same quoting rule as the takeout merge, preserves header order and trailing newline; returns `{ csv, removed }` and leaves the original string untouched when nothing matched. Also export `VIDEO_ID_RE` for route validation.
- [x] Add `DELETE /api/library/videos?id=...`: validates the 11-char id (400 otherwise), 404s when there is no saved library, removes rows and calls `saveLibrary` only when `removed > 0` (idempotent), returns `{ ok, removed, library }`.
- [x] Client (`app/page.tsx`): `deleteVideoRow(id)` with a `deletingVideoId` re-entry guard; on success updates `result` (videos/notFound/uniqueIds) and `selected` in place, no full reload; errors go to the inline error banner.
- [x] Add a `Trash2` "Remove from library" icon button to each main-table row (next to the YouTube link) and to not-found rows — hidden there for ids that fail the 11-char pattern since the endpoint rejects them.

## Verification

- `pnpm lint` — pass
- `pnpm exec tsc --noEmit` — pass
- `pnpm build` — pass
- Smoke test against `pnpm dev`: save 3-row CSV, delete an id with a duplicate row → `removed: 2`, quoted fields preserved; second delete → `removed: 0`; invalid id → 400.
