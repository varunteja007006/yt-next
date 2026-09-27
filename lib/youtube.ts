import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "youtubei";

export type VideoMetadata = {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  duration: number | null;
  viewCount: number | null;
  thumbnail: string;
  artist: string | null;
  album: string | null;
  url: string;
};

export type MetadataResult = {
  videos: VideoMetadata[];
  notFound: string[];
};

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "metadata.json");

const client = new Client();
const cache = new Map<string, VideoMetadata | null>();
let cacheLoaded = false;
let saveQueued = false;

async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const entries = JSON.parse(raw) as [string, VideoMetadata | null][];
    for (const [id, meta] of entries) cache.set(id, meta);
    console.log(`[metadata] cache loaded: ${entries.length} entries from ${CACHE_FILE}`);
  } catch {
    console.log("[metadata] cache empty, starting fresh");
  }
}

function queueSave() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(async () => {
    saveQueued = false;
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const tmp = CACHE_FILE + ".tmp";
      await fs.writeFile(tmp, JSON.stringify([...cache]));
      await fs.rename(tmp, CACHE_FILE);
      console.log(`[metadata] cache saved: ${cache.size} entries`);
    } catch (error) {
      console.error("Failed to persist metadata cache:", error);
    }
  }, 2000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickThumbnail(
  thumbnails: Array<{ url: string; width: number }>
): string {
  return (
    [...thumbnails].sort((a, b) => b.width - a.width)[0]?.url ?? ""
  );
}

async function fetchOne(videoId: string): Promise<VideoMetadata | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const video = await client.getVideo(videoId);
      if (!video) return null;

      const music = "music" in video ? video.music : null;

      return {
        id: videoId,
        title: video.title ?? "Untitled",
        channel: video.channel?.name ?? "",
        publishedAt: video.uploadDate ?? "",
        duration:
          "duration" in video && typeof video.duration === "number"
            ? video.duration
            : null,
        viewCount: video.viewCount ?? null,
        thumbnail: pickThumbnail([...(video.thumbnails ?? [])]),
        artist: music?.artist ?? null,
        album: music?.album ?? null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1) {
        console.error(`[metadata] failed ${videoId} after ${MAX_ATTEMPTS} attempts:`, error);
        return null;
      }
      console.warn(`[metadata] retry ${attempt + 1}/${MAX_ATTEMPTS - 1} for ${videoId}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}

async function runPool(ids: string[]): Promise<Map<string, VideoMetadata | null>> {
  const results = new Map<string, VideoMetadata | null>();
  let cursor = 0;
  let done = 0;
  const startedAt = Date.now();

  console.log(`[metadata] fetching ${ids.length} videos (${CONCURRENCY} workers)`);

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const meta = await fetchOne(id);
      results.set(id, meta);
      done++;
      if (done % 25 === 0 || done === ids.length) {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          `[metadata] progress ${done}/${ids.length} (${meta ? "ok" : "miss"}: ${id}) ${secs}s`
        );
      }
      await sleep(100);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker)
  );

  console.log(
    `[metadata] done: ${results.size} fetched, ${
      [...results.values()].filter((m) => m === null).length
    } not found, in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  );

  return results;
}

export async function fetchMetadata(
  videoIds: string[]
): Promise<MetadataResult> {
  await loadCache();

  const videos: VideoMetadata[] = [];
  const notFound: string[] = [];
  const pending: string[] = [];

  for (const id of videoIds) {
    if (cache.has(id)) {
      const cached = cache.get(id);
      if (cached) videos.push(cached);
      else notFound.push(id);
    } else {
      pending.push(id);
    }
  }

  if (pending.length > 0) {
    console.log(
      `[metadata] request: ${videoIds.length} ids, ${cache.size > 0 ? videoIds.length - pending.length + " cache hits, " : ""}${pending.length} to fetch`
    );
    const fetched = await runPool(pending);

    for (const [id, meta] of fetched) {
      cache.set(id, meta);
      if (meta) videos.push(meta);
      else notFound.push(id);
    }

    queueSave();
  }

  const order = new Map(videoIds.map((id, i) => [id, i]));
  videos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { videos, notFound };
}
