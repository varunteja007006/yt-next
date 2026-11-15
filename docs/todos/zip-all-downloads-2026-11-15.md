# Zip all downloads

**Completion: 100%**

## What

Adds a "Zip all" button to the library toolbar that packages every completed
download into a single archive at the project root (`downloads-export.zip`).

- `lib/downloads.ts`: new `zipAllDownloads()` export. After a registry sync it
  collects every `done` entry's file, deletes any previous export (zip merges
  into existing archives, so each run starts fresh), and shells out to `zip`
  from inside `downloads/`. The archive is flat (`zip -j` junk paths) — no
  `<videoId>/` folders — since folder names are just video ids and hard to
  browse after extraction. Duplicate paths in the registry are zipped once;
  when two different videos share a title, the collision is resolved by
  staging symlinks named `Title (videoId).ext` (zip follows symlinks by
  default and stores the target content). Returns the file path, file count,
  and archive size.
- `app/api/downloads/route.ts`: POST bodies with `action: "zip"` run the
  export and return `{ file, count, sizeBytes, downloads }`; failures return a
  400 with the error message.
- `app/api/downloads/zip/route.ts` (added 2026-11-15): GET streams the archive
  as a browser download (`Content-Disposition: attachment`). The on-disk copy
  is a cache guarded by zip export metadata in the `settings` table (files
  included, count, size, built-at): `ensureFreshZip()` in `lib/downloads.ts`
  compares that record against the completed downloads and rebuilds whenever
  they differ, so archives fetched after new downloads or deletions are never
  stale. A matching record means the existing zip is streamed without a
  rebuild.
- `app/page.tsx`: "Zip all (N)" button (only rendered when N > 0) next to the
  Filters panel, with a spinner while running and an emerald success note
  showing the file count and archive size. After the build the client triggers
  a browser download of `/api/downloads/zip` so the archive lands in the
  user's Downloads folder regardless of where the server process runs. The
  registry refresh comes back in the same response. Next to the button a
  "Last export" line (from `zipMeta`, refreshed by the 3s registry poll)
  shows the cached archive's file count, size, and build time.

## Why

There was no bulk export path — moving a whole library's worth of downloaded
media off the machine meant walking `downloads/<videoId>/` by hand. One zip
with stable per-video folders makes the local library portable in a click.

## Notes

- Requires the `zip` binary on PATH (present on standard Fedora installs).
- `downloads-export.zip` is gitignored alongside `downloads/`.

## Fix (2026-11-15): zip exited with 16

Zip's exit code 16 is "Invalid command arguments": a download whose video id
starts with a dash (e.g. `-XI2_610F0s/`) made `zip` parse the relative path as
an option list (`-X -I -2 ...`). Fixed by adding `--` to the argv before the
file list so everything after it is treated as filenames.

## Fix (2026-11-15): flat archive

The archive is now flat (no `<videoId>/` folders) via `zip -j`. Registry
duplicate paths (same file under an original + re-download entry) are zipped
once, and titles shared by different videos are disambiguated as
`Title (videoId).ext` through temp symlinks that are cleaned up after zip
finishes reading them.
