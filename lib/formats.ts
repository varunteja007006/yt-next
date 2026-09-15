import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

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

const CACHE_FILE = path.join(process.cwd(), ".cache", "formats.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FormatsCache = Record<
  string,
  { fetchedAt: string; formats: VideoFormatInfo[] }
>;

let cache: FormatsCache | null = null;

async function loadCache() {
  if (cache) return;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf-8"));
  } catch {
    cache = {};
  }
}

function saveCache() {
  if (!cache) return;
  fs.mkdir(path.dirname(CACHE_FILE), { recursive: true })
    .then(() => fs.writeFile(CACHE_FILE, JSON.stringify(cache)))
    .catch((e) => console.error("[formats] failed to save cache:", e));
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

export async function getFormats(
  videoId: string,
  refresh = false
): Promise<{ formats: VideoFormatInfo[] }> {
  await loadCache();

  const cached = cache![videoId];
  if (
    !refresh &&
    cached &&
    Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS
  ) {
    return { formats: cached.formats };
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", ["-J", "--no-playlist", url], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split("\n").slice(-2).join(" | ") || `exit ${code}`));
    });
  });

  const info = JSON.parse(stdout) as { formats?: RawFormat[] };
  const formats = buildFormats(info.formats ?? []);

  cache![videoId] = { fetchedAt: new Date().toISOString(), formats };
  saveCache();

  return { formats };
}
