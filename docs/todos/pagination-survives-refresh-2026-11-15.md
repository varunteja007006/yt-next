# Pagination survives refresh via URL params

Persist `page` and `pageSize` in the URL query string so a refresh (or a shared
link) reopens the library on the same page instead of resetting to page 1.

- Initial `page` / `pageSize` state is read from `?page=` / `?pageSize=` in
  lazy `useState` initializers (server render falls back to defaults; no
  hydration mismatch because `result` is always null on first render).
- A `useEffect` mirrors the clamped `currentPage` and `pageSize` back into the
  URL with `history.replaceState` (no navigation, no scroll jump) once data is
  loaded, so an empty app never grows a query string.
- `useSearchParams` was deliberately avoided: on a statically prerendered page
  it requires a `Suspense` boundary or the production build fails.

Status: complete (100%).
