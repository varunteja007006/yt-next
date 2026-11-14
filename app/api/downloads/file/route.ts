import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

import { DOWNLOADS_DIR, getRegistry, syncRegistry } from "@/lib/downloads";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mkv": "video/x-matroska",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId") ?? "";
  const formatKey = url.searchParams.get("formatKey") ?? "";
  if (!/^[\w-]{11}$/.test(videoId) || !formatKey) {
    return Response.json(
      { error: "videoId and formatKey required" },
      { status: 400 }
    );
  }

  await syncRegistry();

  const entry = getRegistry()[videoId]?.[formatKey];
  if (!entry || entry.status !== "done" || !entry.file) {
    return Response.json({ error: "Download not found" }, { status: 404 });
  }

  // Registry data is local but treat it as untrusted: never serve anything
  // outside the downloads directory.
  const filePath = path.resolve(entry.file);
  const downloadsRoot = path.resolve(DOWNLOADS_DIR);
  if (
    filePath !== downloadsRoot &&
    !filePath.startsWith(downloadsRoot + path.sep)
  ) {
    return Response.json({ error: "Invalid file path" }, { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    return Response.json({ error: "File missing on disk" }, { status: 404 });
  }

  const contentType =
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";

  // Single-range support so browser audio/video seeking works. Anything we
  // can't parse falls back to a full 200 response.
  const range = /^bytes=(\d*)-(\d*)$/.exec(
    (request.headers.get("range") ?? "").trim()
  );
  if (range) {
    const hasStart = range[1] !== "";
    const start = hasStart ? Number(range[1]) : null;
    const end = range[2] !== "" ? Number(range[2]) : null;

    let rangeStart: number;
    let rangeEnd: number;
    if (!hasStart) {
      // Suffix range: last N bytes ("bytes=-N").
      if (end === 0) {
        return rangeNotSatisfiable(stat.size);
      }
      rangeStart = Math.max(0, stat.size - (end ?? 0));
      rangeEnd = stat.size - 1;
    } else {
      rangeStart = start!;
      rangeEnd = end === null ? stat.size - 1 : Math.min(end, stat.size - 1);
    }

    if (rangeStart > rangeEnd || rangeStart >= stat.size) {
      return rangeNotSatisfiable(stat.size);
    }

    const stream = Readable.toWeb(
      createReadStream(filePath, { start: rangeStart, end: rangeEnd })
    ) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(rangeEnd - rangeStart + 1),
        "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${stat.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(filePath)
  ) as unknown as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
}

function rangeNotSatisfiable(size: number) {
  return new Response(null, {
    status: 416,
    headers: { "Content-Range": `bytes */${size}` },
  });
}
