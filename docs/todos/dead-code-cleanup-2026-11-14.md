# Dead Code Cleanup

## Goal

Apply ponytail-audit findings 1–5:

- Replace duplicated types in `app/page.tsx` with `import type` from `lib/formats.ts` / `lib/downloads.ts`.
- Delete unused `deleteCache()` (`lib/db.ts`) and `initDownloads()` (`lib/downloads.ts`).
- Un-export internal-only symbols in `lib/db.ts` and `lib/best-format.ts`.
- Fix stale `.gitignore` comment for `/.cache/`.

## Tasks

- [x] Type imports replace local duplicates in `app/page.tsx`
- [x] `deleteCache` + `initDownloads` removed
- [x] Internal-only exports un-exported
- [x] `.gitignore` comment corrected
- [x] Verification: lint, typecheck, build

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
