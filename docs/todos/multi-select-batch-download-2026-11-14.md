# Multi-Select Batch Download

## Goal

- Let the user select multiple videos in the results table and enqueue best-video / best-audio downloads for all of them in one request.

## Tasks

- [x] Extend `POST /api/downloads` with an optional `items` array (per-item validation, per-item `error`, full registry in the response; single-video behavior unchanged).
- [x] Add selection state (`Set<string>`) with a leading checkbox column in the results table, including a header checkbox with indeterminate state that selects/deselects all filtered videos.
- [x] Add a batch action bar ("N selected", Download best video, Download best audio, Clear) shown only when a selection exists.
- [x] Batch submit POSTs `{ items: [...] }`, updates the registry from the response, clears the selection, and reports failures via the existing error display.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
