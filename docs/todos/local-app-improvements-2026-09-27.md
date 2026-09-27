# Local App Improvements

These tasks improve reliability and usability for the intended single-machine,
local-only deployment. They are ordered roughly by implementation priority.

## 1. Document the Local-Only Deployment Model (complete)

- [x] State that the app is intended for one user on one machine.
- [x] Recommend binding the development and production servers to `localhost`.
- [x] Document the required Node.js version and writable storage requirements.
- [x] Document installation requirements for `yt-dlp` and `ffmpeg`.
- [x] Explain where the SQLite database, caches, registry, and downloaded files are stored.

## 2. Prevent Duplicate Downloads

- Treat `queued` and `in_progress` downloads as active jobs.
- Return the existing job instead of enqueuing another process for the same video and format.
- Ensure concurrent requests cannot overwrite the same registry entry.
- Add tests for repeated and concurrent download requests.

## 3. Add yt-dlp Timeouts

- Add a maximum runtime for metadata format enumeration.
- Add a maximum runtime for downloads.
- Terminate timed-out child processes cleanly.
- Limit captured stdout and stderr sizes.
- Mark timed-out downloads as failed with a useful user-facing error.

## 4. Make Library Migration Failure-Safe

- Keep the localStorage copy until the server confirms a successful save.
- Attempt the localStorage fallback when the initial library request fails.
- Display or log migration failures without losing the local copy.
- Add a test for a failed library POST.

## 5. Prevent Reset and Request Races

- Cancel in-flight metadata requests when the user resets or selects another file.
- Cancel or invalidate pending library persistence requests during reset.
- Prevent stale responses from repopulating the UI.
- Add tests for reset while metadata loading is active.

## 6. Fix the Not-Found Filter

- Show all not-found IDs when the search query is empty.
- Preserve query filtering when a search term is present.
- Verify that the `not found only` status filter works without requiring a search term.
- Add a unit test for empty and non-empty queries.

## 7. Improve CSV Parsing

- Support multiline quoted CSV fields.
- Detect and report malformed quoting.
- Validate required headers and provide actionable parse errors.
- Replace repeated `includes` checks with a `Set` for invalid IDs.
- Add tests for quoted commas, multiline values, duplicate IDs, and invalid rows.

## 8. Use Reliable Output-File Detection

- Stop identifying completed files only by comparing modification times.
- Use yt-dlp output reporting to obtain the exact final path.
- Alternatively, use a unique output directory or template for each job.
- Add tests covering existing files, post-processing, and concurrent jobs.

## 9. Add Basic Automated Tests

- Add unit tests for CSV parsing and video ID extraction.
- Add unit tests for client-side filtering.
- Add tests for download state transitions and duplicate-job handling.
- Add integration tests with a mocked yt-dlp executable.
- Cover failures, timeouts, missing dependencies, and output-file handling.
