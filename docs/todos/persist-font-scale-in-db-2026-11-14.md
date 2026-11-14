# Persist Font Scale in DB

## Goal

- Store the UI font-scale ("page zoom") setting in the SQLite DB instead of localStorage, so it survives port changes (localStorage is origin-scoped).

## Tasks

- [x] Add a `settings` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL`) to the schema in `lib/db.ts`, with `getSetting` / `setSetting` helpers using the same upsert pattern as `setCache`.
- [x] Add `app/api/settings/route.ts`: `GET` returns `{ fontScale: number | null }` (parsed and clamped server-side, null when unset/corrupt); `PUT` validates and clamps `{ fontScale }`, saves it, and returns the clamped value (400 on invalid body).
- [x] In `app/page.tsx`, drop the `FONT_SCALE_KEY` constant and all localStorage read/write for font scale; the mount effect now fetches `/api/settings` and applies a clamped value, ignoring failures.
- [x] The apply effect still sets `document.documentElement.style.fontSize` and persists via a fire-and-forget `PUT /api/settings`, skipped until the initial load attempt resolves (via `fontScaleLoadedRef`) so the default doesn't clobber the saved value.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
