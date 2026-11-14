# Pagination controls above the table

**Completed: 100%**

## Problem

The Prev/Next pager and rows-per-page select sat **below** the table. After clicking
Next, the scroll position stayed at the bottom of the page, so the user landed on the
bottom rows of the new page (or blank space) and had to scroll up to the top of the
table every time.

## Considered fixes

1. `scrollIntoView` on the table after a page change — needs a ref plus careful timing
   (scrolling in the click handler races with React's batched re-render; an effect on
   `currentPage` would also fire on filter resets that call `setPage(1)`).
2. **Move the pager above the table** (chosen) — the user clicks Next while already at
   the top of the table, so no scrolling is needed at all. No refs, no effects.

## Changes

- `app/page.tsx`: moved the pager row (Prev / Page x of y / Next + rows-per-page)
  from below the table to directly above it, between the "Showing X–Y of Z" summary
  line and the table. Removed the duplicate row below the table.

## Verification

- `pnpm lint` — pass
- `pnpm exec tsc --noEmit` — pass
