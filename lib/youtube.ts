import { Client } from "youtubei";

import { getCache, setCache } from "./db";

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

const client = new Client();

// Metadata is cached per video under `metadata:<videoId>`. The JSON payload is
// the VideoMetadata or literal `null` (negative caching for missing videos).
function getCachedMetadata(videoId: string): VideoMetadata | null | undefined {
  const row = getCache(`metadata:${videoId}`);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as VideoMetadata | null;
  } catch {
    return undefined;
  }
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
  const videos: VideoMetadata[] = [];
  const notFound: string[] = [];
  const pending: string[] = [];

  for (const id of videoIds) {
    const cached = getCachedMetadata(id);
    if (cached !== undefined) {
      if (cached) videos.push(cached);
      else notFound.push(id);
    } else {
      pending.push(id);
    }
  }

  if (pending.length > 0) {
    const hits = videoIds.length - pending.length;
    console.log(
      `[metadata] request: ${videoIds.length} ids, ${hits > 0 ? `${hits} cache hits, ` : ""}${pending.length} to fetch`
    );
    const fetched = await runPool(pending);

    for (const [id, meta] of fetched) {
      setCache(`metadata:${id}`, JSON.stringify(meta));
      if (meta) videos.push(meta);
      else notFound.push(id);
    }
  }

  const order = new Map(videoIds.map((id, i) => [id, i]));
  videos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { videos, notFound };
}
