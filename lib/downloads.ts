import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getFormats, getFreshCachedFormats } from "./formats";
import { resolveBestFormat } from "./best-format";
import {
  countDownloadEntries,
  deleteDownloadEntry,
  getAllDownloadEntries,
  upsertDownloadEntry,
} from "./db";

export type DownloadStatus = "queued" | "in_progress" | "done" | "failed";

export type DownloadEntry = {
  formatKey: string;
  label: string;
  status: DownloadStatus;
  // What was actually started (best modes are stored post-resolution).
  // Optional so entries persisted before these fields existed still load.
  mode?: DownloadMode;
  itag?: string;
  file?: string;
  sizeBytes?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

export type DownloadRegistry = Record<string, Record<string, DownloadEntry>>;

export type DownloadMode =
  | "audio-best"
  | "audio-itag"
  | "video-best"
  | "video-only-itag"
  | "muxed-itag";

export const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");
// Pre-SQLite registry location. Only read once for migration, never written.
const LEGACY_REGISTRY_FILE = path.join(process.cwd(), ".cache", "downloads.json");

const registry: DownloadRegistry = {};
let registryLoaded = false;

// Backstop only — real downloads can legitimately take a long time; this
// exists so a hung yt-dlp can't block the serial queue forever.
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

function entryToRow(videoId: string, entry: DownloadEntry) {
  return {
    video_id: videoId,
    format_key: entry.formatKey,
    label: entry.label,
    status: entry.status,
    mode: entry.mode ?? null,
    itag: entry.itag ?? null,
    file: entry.file ?? null,
    size_bytes: entry.sizeBytes ?? null,
    error: entry.error ?? null,
    started_at: entry.startedAt,
    finished_at: entry.finishedAt ?? null,
  };
}

function rowToEntry(row: {
  format_key: string;
  label: string;
  status: string;
  mode: string | null;
  itag: string | null;
  file: string | null;
  size_bytes: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}): DownloadEntry {
  return {
    formatKey: row.format_key,
    label: row.label,
    status: row.status as DownloadStatus,
    mode: row.mode === null ? undefined : (row.mode as DownloadEntry["mode"]),
    itag: row.itag ?? undefined,
    file: row.file ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

// Write-through: the in-memory registry stays the hot cache, every mutation
// is persisted to SQLite as it happens.
function persistEntry(videoId: string, entry: DownloadEntry) {
  upsertDownloadEntry(entryToRow(videoId, entry));
}

async function ensureRegistry() {
  if (registryLoaded) return;
  registryLoaded = true;

  loadRegistryFromDb();
  await migrateLegacyRegistryFile();

  // Any non-terminal entries belong to a dead process — mark them failed.
  let interrupted = 0;
  for (const [videoId, entries] of Object.entries(registry)) {
    for (const entry of Object.values(entries)) {
      if (entry.status === "queued" || entry.status === "in_progress") {
        entry.status = "failed";
        entry.error = "Interrupted by server restart";
        entry.finishedAt = new Date().toISOString();
        persistEntry(videoId, entry);
        interrupted++;
      }
    }
  }
  if (interrupted > 0) {
    console.log(`[downloads] marked ${interrupted} interrupted downloads as failed`);
  }

  await pruneMissing();
}

function loadRegistryFromDb() {
  for (const row of getAllDownloadEntries()) {
    const entry = rowToEntry(row);
    registry[row.video_id] = { ...registry[row.video_id], [entry.formatKey]: entry };
  }
}

// One-time import of the pre-SQLite JSON registry: only when the legacy file
// exists AND the DB table is empty. The file is renamed (not deleted) after a
// successful import; if the DB already has entries the file is left untouched.
async function migrateLegacyRegistryFile() {
  if (countDownloadEntries() > 0) return;
  let raw: string;
  try {
    raw = await fs.readFile(LEGACY_REGISTRY_FILE, "utf-8");
  } catch {
    return;
  }
  let legacy: DownloadRegistry;
  try {
    legacy = JSON.parse(raw) as DownloadRegistry;
  } catch (error) {
    console.error("[downloads] failed to parse legacy downloads.json, leaving it in place:", error);
    return;
  }

  let imported = 0;
  for (const [videoId, entries] of Object.entries(legacy)) {
    for (const entry of Object.values(entries)) {
      registry[videoId] = { ...registry[videoId], [entry.formatKey]: entry };
      persistEntry(videoId, entry);
      imported++;
    }
  }
  await fs.rename(LEGACY_REGISTRY_FILE, `${LEGACY_REGISTRY_FILE}.imported`).catch(() => {});
  console.log(`[downloads] migrated ${imported} entries from legacy downloads.json into SQLite`);
}

// Drop "done" entries whose file no longer exists on disk, so deleting the
// downloads folder can't leave stale registry entries behind.
async function pruneMissing() {
  let pruned = 0;
  for (const [videoId, entries] of Object.entries(registry)) {
    for (const [formatKey, entry] of Object.entries(entries)) {
      if (!entry.file) continue;
      try {
        const stat = await fs.stat(entry.file);
        if (stat.isFile()) continue;
      } catch {
        // file missing
      }
      delete entries[formatKey];
      deleteDownloadEntry(videoId, formatKey);
      pruned++;
    }
    if (Object.keys(entries).length === 0) delete registry[videoId];
  }
  if (pruned > 0) {
    console.log(`[downloads] pruned ${pruned} entries with missing files`);
  }

  await adoptOrphans();
}

// Pick up files on disk that have no registry entry (e.g. after a registry
// wipe or files added outside the app) so they aren't invisible to the UI.
async function adoptOrphans() {
  let dirs: string[];
  try {
    dirs = await fs.readdir(DOWNLOADS_DIR);
  } catch {
    return;
  }

  let adopted = 0;
  for (const videoId of dirs) {
    if (!/^[\w-]{11}$/.test(videoId)) continue;
    const dir = path.join(DOWNLOADS_DIR, videoId);
    let files: string[];
    try {
      if (!(await fs.stat(dir)).isDirectory()) continue;
      files = await fs.readdir(dir);
    } catch {
      continue;
    }

    const known = new Set(
      Object.values(registry[videoId] ?? {})
        .map((e) => e.file)
        .filter((f): f is string => Boolean(f))
    );

    for (const name of files) {
      if (name.startsWith(".") || name.endsWith(".part") || name.endsWith(".ytdl")) continue;
      const full = path.join(dir, name);
      if (known.has(full)) continue;
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        const at = stat.mtime.toISOString();
        const entry: DownloadEntry = {
          formatKey: `file-${name}`,
          label: "On disk",
          status: "done",
          file: full,
          sizeBytes: stat.size,
          startedAt: at,
          finishedAt: at,
        };
        registry[videoId] = { ...registry[videoId], [entry.formatKey]: entry };
        persistEntry(videoId, entry);
        adopted++;
      } catch {
        // unreadable file — skip
      }
    }
  }
  if (adopted > 0) {
    console.log(`[downloads] adopted ${adopted} untracked files`);
  }
}

export async function syncRegistry() {
  await ensureRegistry();
  await pruneMissing();
}

async function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`yt-dlp timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`));
    }, DOWNLOAD_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().split("\n").slice(-3).join(" | ") || `exit ${code}`));
    });
  });
}

async function latestFileIn(dir: string): Promise<string | undefined> {
  try {
    const files = await fs.readdir(dir);
    const stats = await Promise.all(
      files.map(async (name) => {
        const full = path.join(dir, name);
        const s = await fs.stat(full);
        return { full, mtime: s.mtimeMs };
      })
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    return stats[0]?.full;
  } catch {
    return undefined;
  }
}

const MODE_LABELS: Record<DownloadMode, string> = {
  "audio-best": "Best audio",
  "audio-itag": "Audio",
  "video-best": "Best video",
  "video-only-itag": "Video",
  "muxed-itag": "Video (muxed)",
};

function formatKeyFor(mode: DownloadMode, itag?: string) {
  return itag ? `itag-${itag}` : mode;
}

function ytDlpArgs(
  videoId: string,
  mode: DownloadMode,
  itag: string | undefined
): string[] {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const out = path.join(DOWNLOADS_DIR, videoId, "%(title)s.%(ext)s");
  const base = [
    "--no-playlist",
    "--no-overwrites",
    "--js-runtimes",
    "node",
    "--socket-timeout",
    "15",
    "--retries",
    "3",
    "-o",
    out,
  ];

  switch (mode) {
    case "audio-best":
      return [...base, "-f", "bestaudio[ext=m4a]/bestaudio", "-x", "--embed-thumbnail", "--add-metadata", url];
    case "audio-itag":
      return [...base, "-f", itag!, "-x", "--embed-thumbnail", "--add-metadata", url];
    case "video-best":
      return [...base, "-f", "bv*+ba/b", "-S", "res,ext:mp4:m4a", url];
    case "video-only-itag":
      return [...base, "-f", `${itag}+ba/b`, url];
    case "muxed-itag":
      return [...base, "-f", itag!, url];
  }
}

const queue: Array<() => Promise<void>> = [];
let running = false;

async function drain() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    await queue.shift()!();
  }
  running = false;
}

export function getRegistry(): DownloadRegistry {
  return registry;
}

export async function startDownload(opts: {
  videoId: string;
  mode: DownloadMode;
  itag?: string;
  label?: string;
}): Promise<{ skipped?: boolean; entry: DownloadEntry }> {
  await ensureRegistry();
  const { videoId } = opts;
  let { mode, itag } = opts;
  let formatKey = formatKeyFor(mode, itag);
  const label = opts.label ?? MODE_LABELS[mode];

  // "Best" modes are resolved to the concrete itag yt-dlp would pick, so they
  // share a registry entry (and dedup) with explicit itag downloads of the
  // same stream instead of registering a duplicate under a mode-named key.
  // If formats can't be resolved (fetch failure/empty), fall back to the old
  // mode-named key rather than failing the request.
  //
  // Legacy entries stored under mode keys are NOT migrated at load time:
  // retroactively matching their files to itags is ambiguous. They are left
  // in place (pruneMissing/adoptOrphans tolerate them like any other entry)
  // and are lazily re-keyed here when a later best-mode request resolves and
  // nothing exists yet under the resolved itag key.
  // If formats are cached (fresh within TTL) resolution is an instant DB read,
  // so do it here to dedup/legacy-rekey exactly as before. Otherwise leave the
  // entry under the mode-named key and resolve inside the queue task below —
  // resolving here would await a yt-dlp -J spawn and stall the POST response.
  if (!itag && (mode === "video-best" || mode === "audio-best")) {
    const cachedFormats = getFreshCachedFormats(videoId);
    if (cachedFormats) {
      try {
        const resolved = resolveBestFormat(mode, cachedFormats);
        if (resolved) {
          const legacyKey = mode;
          itag = resolved.itag;
          mode =
            mode === "audio-best"
              ? "audio-itag"
              : resolved.kind === "muxed"
                ? "muxed-itag"
                : "video-only-itag";
          formatKey = formatKeyFor(mode, itag);
          const legacy = registry[videoId]?.[legacyKey];
          if (legacy && !registry[videoId]?.[formatKey]) {
            delete registry[videoId][legacyKey];
            deleteDownloadEntry(videoId, legacyKey);
            const rekeyed = { ...legacy, formatKey };
            registry[videoId] = { ...registry[videoId], [formatKey]: rekeyed };
            persistEntry(videoId, rekeyed);
          }
        }
      } catch (error) {
        console.log(`[downloads] best-mode resolution failed for ${videoId}:`, error);
      }
    }
  }

  const existing = registry[videoId]?.[formatKey];
  if (existing?.status === "done" && existing.file) {
    try {
      const stat = await fs.stat(existing.file);
      if (stat.isFile()) return { skipped: true, entry: existing };
    } catch {
      // file gone — re-download
    }
  }

  const entry: DownloadEntry = {
    formatKey,
    label,
    mode,
    itag,
    status: "queued",
    startedAt: new Date().toISOString(),
  };

  registry[videoId] = { ...registry[videoId], [formatKey]: entry };
  persistEntry(videoId, entry);

  queue.push(async () => {
    let current = registry[videoId]?.[formatKey];
    if (!current || current.status === "done") return;
    current.status = "in_progress";
    persistEntry(videoId, current);

    try {
      // Best modes enqueued without cached formats resolve their itag here,
      // inside the queue, so the POST request never waits on a yt-dlp -J
      // spawn. Same re-keying/dedup rules as the synchronous path above.
      if (!itag && (mode === "video-best" || mode === "audio-best")) {
        try {
          const { formats } = await getFormats(videoId);
          const resolved = resolveBestFormat(mode, formats);
          if (resolved) {
            const nextMode =
              mode === "audio-best"
                ? "audio-itag"
                : resolved.kind === "muxed"
                  ? "muxed-itag"
                  : "video-only-itag";
            const nextKey = formatKeyFor(nextMode, resolved.itag);
            const existing = registry[videoId]?.[nextKey];
            if (existing?.status === "done" && existing.file) {
              // Already downloaded under the resolved itag — drop the
              // mode-key entry instead of re-downloading.
              delete registry[videoId][formatKey];
              deleteDownloadEntry(videoId, formatKey);
              return;
            }
            delete registry[videoId][formatKey];
            deleteDownloadEntry(videoId, formatKey);
            mode = nextMode;
            itag = resolved.itag;
            formatKey = nextKey;
            current = { ...current, formatKey, mode, itag };
            registry[videoId] = { ...registry[videoId], [formatKey]: current };
            persistEntry(videoId, current);
          }
        } catch (error) {
          console.log(`[downloads] best-mode resolution failed for ${videoId}:`, error);
          // Fall back to downloading under the mode-named key.
        }
      }

      await fs.mkdir(path.join(DOWNLOADS_DIR, videoId), { recursive: true });
      const before = (await latestFileIn(path.join(DOWNLOADS_DIR, videoId))) ?? "";
      console.log(`[downloads] start ${videoId} ${formatKey}`);
      await runYtDlp(ytDlpArgs(videoId, mode, itag));
      const after = (await latestFileIn(path.join(DOWNLOADS_DIR, videoId))) ?? "";
      const file = after && after !== before ? after : current.file;
      if (!file) throw new Error("no output file produced");
      const stat = await fs.stat(file);
      current.status = "done";
      current.file = file;
      current.sizeBytes = stat.size;
      current.finishedAt = new Date().toISOString();
      current.error = undefined;
      console.log(`[downloads] done ${videoId} ${formatKey} (${(stat.size / 1e6).toFixed(1)} MB)`);
    } catch (error) {
      current.status = "failed";
      current.error =
        error instanceof Error ? error.message : String(error);
      current.finishedAt = new Date().toISOString();
      console.error(`[downloads] failed ${videoId} ${formatKey}:`, current.error);
    }
    persistEntry(videoId, current);
  });

  drain().catch((e) => console.error("[downloads] queue error:", e));

  return { entry };
}

export async function removeDownload(videoId: string, formatKey: string) {
  await ensureRegistry();
  const entry = registry[videoId]?.[formatKey];
  if (entry?.file) {
    await fs.rm(entry.file, { force: true }).catch(() => {});
  }
  if (registry[videoId]) {
    delete registry[videoId][formatKey];
    if (Object.keys(registry[videoId]).length === 0) delete registry[videoId];
  }
  deleteDownloadEntry(videoId, formatKey);
}

const ZIP_PATH = path.join(process.cwd(), "downloads-export.zip");

export async function zipAllDownloads(): Promise<{
  file: string;
  count: number;
  sizeBytes: number;
}> {
  await syncRegistry();
  const files: string[] = [];
  for (const entries of Object.values(getRegistry())) {
    for (const entry of Object.values(entries)) {
      if (entry.status === "done" && entry.file) files.push(entry.file);
    }
  }
  if (files.length === 0) {
    throw new Error("No completed downloads to zip");
  }
  // zip merges into existing archives, so start fresh each run.
  await fs.rm(ZIP_PATH, { force: true });
  const rel = files.map((f) => path.relative(DOWNLOADS_DIR, f));
  await new Promise<void>((resolve, reject) => {
    const child = spawn("zip", ["-q", "-X", ZIP_PATH, ...rel], {
      cwd: DOWNLOADS_DIR,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip exited with ${code}: ${stderr.trim()}`));
    });
  });
  const stat = await fs.stat(ZIP_PATH);
  return { file: ZIP_PATH, count: files.length, sizeBytes: stat.size };
}
