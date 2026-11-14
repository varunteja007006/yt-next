# Takeout multi-file merge

## What

Support selecting multiple Google Takeout CSVs at once (playlist `*-videos.csv` files plus the `music library songs.csv` from `music (library and uploads)`). The server merges them into the existing `youtube-music-video-ids-merged.csv` format (17 columns, playlist rows first sorted by filename, music library rows last) and returns the merged CSV; the client then feeds it through the normal `loadCsv` flow, which fetches metadata and persists to the SQLite `library` table. Single-file upload is unchanged.

## Why

The Takeout export splits the library across many per-playlist CSVs, so loading it previously required manually pre-merging the files offline.

## Behavior

- File kind detected by header (`Song Title` column → music library; else playlist, filename fallback `music library songs.csv`).
- One output row per occurrence; `Duplicate Count` is the ID's total occurrences across all inputs, `Is Duplicate` = Yes when > 1.
- Music library rows fill Song Title / Album Title / Artist Name 1–9 (compacted, extras dropped); playlist rows keep only ID + timestamp.
- Video IDs trimmed (new Takeout writes IDs with leading spaces); empty IDs skipped, malformed IDs counted as invalid in stats.

## Files touched

- `lib/takeout.ts` — new merge logic (`mergeTakeoutCsvs`)
- `app/api/library/merge/route.ts` — new POST endpoint (FormData `files`, validation, no persistence)
- `app/page.tsx` — `multiple` file input, multi-file branch in `handleSubmit`, merge stats line
- `docs/todos/todo.md` — index entry

## Status

Completion: 90%
