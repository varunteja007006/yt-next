# UI Cleanup

## Completed

- Reworked the page into a dark local media workspace with clearer upload, filtering, and catalog hierarchy.
- Added responsive table overflow for smaller screens.
- Replaced the generated shadcn button implementation with a small local button primitive.
- Removed unused shadcn configuration and UI dependencies.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
