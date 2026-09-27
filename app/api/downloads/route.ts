import {
  getRegistry,
  removeDownload,
  startDownload,
  syncRegistry,
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
    action?: string;
    formatKey?: string;
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

  const { videoId, mode, itag } = body;
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
    const result = await startDownload({ videoId, mode, itag });
    return Response.json({ ...result, downloads: getRegistry() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start download";
    return Response.json({ error: message }, { status: 500 });
  }
}
