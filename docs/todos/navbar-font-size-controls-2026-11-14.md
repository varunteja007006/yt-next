# Navbar Font-Size Controls

## Goal

- Add increase / decrease / reset font-size buttons to the top navbar so the whole rem-based UI scales.

## Tasks

- [x] Add `AArrowDown` / `RotateCcw` / `AArrowUp` button group to the `<header>` in `app/page.tsx` using the canonical `Button` (`size="sm" variant="ghost"`).
- [x] Maintain a font scale in state (default 1, clamped 0.75–1.5, step 0.125) and apply it via `document.documentElement.style.fontSize = 16 * scale + "px"` in a `useEffect`.
- [x] Persist the scale in localStorage under `yt-next:font-scale` with try/catch, and restore it on mount only inside an effect (no hydration mismatch).
- [x] Disable decrease/increase at the bounds; reset returns to the default scale.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
