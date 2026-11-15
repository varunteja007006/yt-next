# Zip all downloads

**Completion: 100%**

## What

Adds a "Zip all" button to the library toolbar that packages every completed
download into a single archive at the project root (`downloads-export.zip`).

- `lib/downloads.ts`: new `zipAllDownloads()` export. After a registry sync it
  collects every `done` entry's file, deletes any previous export (zip merges
  into existing archives, so each run starts fresh), and shells out to `zip`
  from inside `downloads/` with paths relative to that directory so the
  archive preserves the `videoId/file.ext` layout. Returns the file path,
  file count, and archive size.
- `app/api/downloads/route.ts`: POST bodies with `action: "zip"` run the
  export and return `{ file, count, sizeBytes, downloads }`; failures return a
  400 with the error message.
- `app/page.tsx`: "Zip all (N)" button (only rendered when N > 0) next to the
  Filters panel, with a spinner while running and an emerald success note
  showing the file count and archive size. The registry refresh comes back in
  the same response.

## Why

There was no bulk export path — moving a whole library's worth of downloaded
media off the machine meant walking `downloads/<videoId>/` by hand. One zip
with stable per-video folders makes the local library portable in a click.

## Notes

- Requires the `zip` binary on PATH (present on standard Fedora installs).
- `downloads-export.zip` is gitignored alongside `downloads/`.
