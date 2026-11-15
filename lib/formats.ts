import { spawn } from "node:child_process";

import { getCache, setCache } from "./db";

export type VideoFormatInfo = {
  itag: string;
  kind: "audio" | "video" | "muxed";
  ext: string;
  label: string;
  height: number | null;
  fps: number | null;
  abr: number | null;
  tbr: number | null;
  sizeBytes: number | null;
  approx: boolean;
};

type RawFormat = {
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  fps?: number;
  abr?: number;
  tbr?: number;
  format_note?: string;
  resolution?: string;
  filesize?: number;
  filesize_approx?: number;
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// yt-dlp -J metadata fetch: should take seconds; this only catches hangs.
const FORMAT_TIMEOUT_MS = 90 * 1000;

type FormatsCacheEntry = {
  fetchedAt: string;
  formats: VideoFormatInfo[];
};

function getCachedFormats(videoId: string): FormatsCacheEntry | undefined {
  const row = getCache(`formats:${videoId}`);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as FormatsCacheEntry;
  } catch {
    return undefined;
  }
}

function buildFormats(raw: RawFormat[]): VideoFormatInfo[] {
  const out: VideoFormatInfo[] = [];

  for (const f of raw) {
    const isStoryboard =
      f.vcodec === "none" && f.acodec === "none";
    const isPremium = f.format_note?.toLowerCase().includes("premium");
    if (isStoryboard || isPremium || !f.format_id) continue;

    const kind: VideoFormatInfo["kind"] =
      f.vcodec !== "none" && f.acodec !== "none"
        ? "muxed"
        : f.vcodec !== "none"
          ? "video"
          : "audio";

    const hasExactSize = typeof f.filesize === "number";

    out.push({
      itag: f.format_id,
      kind,
      ext: f.ext ?? "",
      label:
        kind === "audio"
          ? f.abr
            ? `${Math.round(f.abr)} kbps`
            : (f.format_note ?? "audio")
          : (f.format_note ?? f.resolution ?? `${f.height ?? "?"}p`),
      height: f.height ?? null,
      fps: f.fps ?? null,
      abr: f.abr ?? null,
      tbr: f.tbr ?? null,
      sizeBytes: f.filesize ?? f.filesize_approx ?? null,
      approx: !hasExactSize,
    });
  }

  out.sort((a, b) => {
    if (a.kind === "audio" && b.kind === "audio") return (b.abr ?? 0) - (a.abr ?? 0);
    if (b.height !== a.height) return (b.height ?? 0) - (a.height ?? 0);
    return (b.sizeBytes !== null ? 1 : 0) - (a.sizeBytes !== null ? 1 : 0);
  });

  return out;
}

export function getFreshCachedFormats(
  videoId: string
): VideoFormatInfo[] | undefined {
  const cached = getCachedFormats(videoId);
  if (
    cached &&
    Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS
  ) {
    return cached.formats;
  }
  return undefined;
}

export async function getFormats(
  videoId: string,
  refresh = false
): Promise<{ formats: VideoFormatInfo[] }> {
  if (!refresh) {
    const cached = getFreshCachedFormats(videoId);
    if (cached) return { formats: cached };
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      "yt-dlp",
      [
        "-J",
        "--no-playlist",
        "--js-runtimes",
        "node",
        "--socket-timeout",
        "15",
        "--retries",
        "3",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`yt-dlp timed out after ${FORMAT_TIMEOUT_MS / 1000}s`));
    }, FORMAT_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split("\n").slice(-2).join(" | ") || `exit ${code}`));
    });
  });

  const info = JSON.parse(stdout) as { formats?: RawFormat[] };
  const formats = buildFormats(info.formats ?? []);

  const fetchedAt = new Date().toISOString();
  setCache(`formats:${videoId}`, JSON.stringify({ fetchedAt, formats }), fetchedAt);

  return { formats };
}
