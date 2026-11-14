import {
  getRegistry,
  removeDownload,
  startDownload,
  syncRegistry,
  type DownloadEntry,
  type DownloadMode,
} from "@/lib/downloads";

const MODES: DownloadMode[] = [
  "audio-best",
  "audio-itag",
  "video-best",
  "video-only-itag",
  "muxed-itag",
];

export async function GET() {
  await syncRegistry();
  return Response.json({ downloads: getRegistry() });
}

export async function POST(request: Request) {
  let body: {
    videoId?: string;
    mode?: DownloadMode;
    itag?: string;
    label?: string;
    action?: string;
    formatKey?: string;
    items?: Array<{
      videoId?: string;
      mode?: DownloadMode;
      itag?: string;
      label?: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  await syncRegistry();

  if (body.action === "remove") {
    if (!body.videoId || !body.formatKey) {
      return Response.json(
        { error: "videoId and formatKey required" },
        { status: 400 }
      );
    }
    await removeDownload(body.videoId, body.formatKey);
    return Response.json({ downloads: getRegistry() });
  }

  // Batch mode: enqueue one download per item. Per-item validation failures
  // and start errors are reported individually instead of aborting the batch.
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return Response.json(
        { error: "items must be a non-empty array" },
        { status: 400 }
      );
    }
    const results: Array<{
      videoId: string;
      skipped?: boolean;
      entry?: DownloadEntry;
      error?: string;
    }> = [];
    for (const item of body.items) {
      const { videoId, mode, itag, label } = item ?? {};
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
        results.push({ videoId: videoId ?? "", error: "Invalid videoId" });
        continue;
      }
      if (!mode || !MODES.includes(mode)) {
        results.push({ videoId, error: "Invalid mode" });
        continue;
      }
      if (mode.endsWith("-itag") && !itag) {
        results.push({ videoId, error: "itag required for this mode" });
        continue;
      }
      try {
        const result = await startDownload({ videoId, mode, itag, label });
        results.push({ videoId, ...result });
      } catch (error) {
        results.push({
          videoId,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start download",
        });
      }
    }
    return Response.json({ results, downloads: getRegistry() });
  }

  const { videoId, mode, itag, label } = body;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return Response.json({ error: "Invalid videoId" }, { status: 400 });
  }
  if (!mode || !MODES.includes(mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (mode.endsWith("-itag") && !itag) {
    return Response.json({ error: "itag required for this mode" }, { status: 400 });
  }

  try {
    const result = await startDownload({ videoId, mode, itag, label });
    return Response.json({ ...result, downloads: getRegistry() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start download";
    return Response.json({ error: message }, { status: 500 });
  }
}
