# Downloaded-Format Subtitle & True Format Dedup

## Goal

- Replace the ambiguous download-count badge next to "Formats" with per-item downloaded-format info shown under the item name (e.g. `1080p webm`, `Audio` chips).
- Make "Best video" / "Best audio" downloads resolve to their concrete itag so they share a registry entry with the equivalent explicit quality — no duplicate files for the same stream.

## Tasks

- [x] Remove downloaded-count badge beside the Formats toggle in `app/page.tsx`.
- [x] Render downloaded format labels (from `DownloadEntry.label`) as a subtitle line under the item title.
- [x] Resolve `video-best` / `audio-best` modes to a concrete itag in `lib/downloads.ts` before registering, keyed `itag-<itag>`.
- [x] Handle existing registry entries stored under mode keys (migration or graceful fallback).

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
