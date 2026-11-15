# Download Queue Timeouts + Fast POST

## Goal

Stop one stuck video from blocking everything:

- yt-dlp spawns need a JS runtime (`--js-runtimes node` — deno is not installed) and sane network timeouts/retries.
- yt-dlp child processes need kill-timeouts so a hung video can't block the serial queue forever.
- `POST /api/downloads` must return immediately: best-mode format resolution (a `yt-dlp -J` spawn) happens inside the queue task, not inside the request.

## Tasks

- [x] `lib/formats.ts`: add `--js-runtimes node --socket-timeout 15 --retries 3` to the `-J` spawn, 90s kill timeout; export `getFreshCachedFormats` for sync cache reads.
- [x] `lib/downloads.ts`: same flags in `ytDlpArgs`; 30 min backstop kill timeout in `runYtDlp`; best-mode resolution moved into the queued task when no fresh cache exists (entry goes `in_progress` first, re-keys to the resolved itag key, dedups against done entries).
- [x] POST route returns promptly for singles and batches (no route change needed once resolution is in the queue); response shape unchanged.
- [x] Verify: lint, typecheck, build.

## Verification

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
