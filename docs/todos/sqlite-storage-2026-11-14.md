# SQLite Storage Consolidation

## Goal

Consolidate all persistence into `data/yt-next.db` and delete the `.cache/` JSON files:

- Download registry → proper SQLite table (transactional writes, no 500ms debounce).
- Metadata + formats caches → generic `cache` KV table (`key`, `value` JSON, `fetched_at` for TTL).
- One-time migration: import existing `.cache/downloads.json` into SQLite on first load.

## Tasks

- [x] Extend `lib/db.ts` schema: registry table + `cache` KV table; keep library API unchanged.
- [x] `lib/downloads.ts`: read/write registry via SQLite; remove debounce + JSON file; one-time import of `downloads.json`; keep prune/adopt + lazy re-key behavior.
- [x] `lib/youtube.ts` + `lib/formats.ts`: move caches to the `cache` table with existing TTL semantics; remove file IO + debounces.
- [x] Remove all `.cache/` references (never created again); update repo guide in AGENTS.md.
- [x] Verify: lint, typecheck, build + a runtime smoke test of registry/cache round-trip.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
