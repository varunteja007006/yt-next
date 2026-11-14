# Client-Side Table Pagination

## Goal

- Keep the main library table usable with large Takeout CSVs (thousands of rows, each with a thumbnail + many interactive elements). Rendering every filtered row at once choked the DOM, and the 3s downloads poll re-rendered all of it.

## Tasks

- [x] Add `PAGE_SIZE_OPTIONS = [25, 50, 100]` / `PAGE_SIZE_DEFAULT = 50` consts and `page` (1-based) / `pageSize` state in `app/page.tsx`.
- [x] Paginate the combined display list (matched videos first, then not-found) in a memo: `totalItems`, `pageCount`, `pageVideos`, `pageNotFound` slices covering the current page window, including windows that span both arrays.
- [x] Reset `page` to 1 at the change points (`setFilter`, filter Clear, `loadCsv` result set, `clearSaved`, page-size select); clamp for shrinkage (row deletion) via a render-derived `currentPage = Math.min(page, pageCount)` — the eslint `react-hooks/set-state-in-effect` rule forbids setState-in-effect, so no reset/clamp effects were used.
- [x] Table body maps `pageVideos` / `pageNotFound` instead of the full matched arrays; row callback logic unchanged.
- [x] Header "select all" checkbox now operates on the current page only (`allSelected`/`someSelected`/`toggleSelectAll` use `pageVideos`).
- [x] "Showing" line shows the item window (e.g. `Showing 51–75 of 1,204`, still noting the loaded total when filters are active).
- [x] Pager row under the table: Prev/Next (disabled at bounds), `Page X of Y`, and a page-size select styled like the filter selects. Prev/Next/Page hidden when one page; page-size select hidden until there is more than one page of the smallest size.

## Verification

- `pnpm lint` — pass
- `pnpm exec tsc --noEmit` — pass
