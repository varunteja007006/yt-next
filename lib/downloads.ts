import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export type DownloadStatus = "queued" | "in_progress" | "done" | "failed";

export type DownloadEntry = {
  formatKey: string;
  label: string;
  status: DownloadStatus;
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

const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");
const REGISTRY_FILE = path.join(process.cwd(), ".cache", "downloads.json");

let registry: DownloadRegistry = {};
let registryLoaded = false;
let saveQueued = false;

async function ensureRegistry() {
  if (registryLoaded) return;
  registryLoaded = true;
  try {
    registry = JSON.parse(await fs.readFile(REGISTRY_FILE, "utf-8"));
  } catch {
    registry = {};
  }

  // Any non-terminal entries belong to a dead process — mark them failed.
  let interrupted = 0;
  for (const entries of Object.values(registry)) {
    for (const entry of Object.values(entries)) {
      if (entry.status === "queued" || entry.status === "in_progress") {
        entry.status = "failed";
        entry.error = "Interrupted by server restart";
        entry.finishedAt = new Date().toISOString();
        interrupted++;
      }
    }
  }
  if (interrupted > 0) {
    console.log(`[downloads] marked ${interrupted} interrupted downloads as failed`);
    saveRegistry();
  }
}

function saveRegistry() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(async () => {
    saveQueued = false;
    try {
      await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
      await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2));
    } catch (error) {
      console.error("[downloads] failed to save registry:", error);
    }
  }, 500);
}

async function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
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
  const base = ["--no-playlist", "--no-overwrites", "-o", out];

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

export async function initDownloads() {
  await ensureRegistry();
}

export async function startDownload(opts: {
  videoId: string;
  mode: DownloadMode;
  itag?: string;
  label?: string;
}): Promise<{ skipped?: boolean; entry: DownloadEntry }> {
  await ensureRegistry();
  const { videoId, mode, itag } = opts;
  const formatKey = formatKeyFor(mode, itag);
  const label = opts.label ?? MODE_LABELS[mode];

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
    status: "queued",
    startedAt: new Date().toISOString(),
  };

  registry[videoId] = { ...registry[videoId], [formatKey]: entry };
  saveRegistry();

  queue.push(async () => {
    const current = registry[videoId]?.[formatKey];
    if (!current || current.status === "done") return;
    current.status = "in_progress";
    saveRegistry();

    try {
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
    saveRegistry();
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
  saveRegistry();
}
