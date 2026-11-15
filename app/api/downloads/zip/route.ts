import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";

import { ZIP_PATH, ensureFreshZip } from "@/lib/downloads";

// Streams the export archive as a browser download so the file lands in the
// user's Downloads folder regardless of where the server process runs. The
// on-disk zip is a cache: it is rebuilt first when missing or stale (the
// manifest no longer matches the completed downloads).
export async function GET() {
  try {
    await ensureFreshZip();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create zip";
    return Response.json({ error: message }, { status: 400 });
  }

  const stat = await fs.stat(ZIP_PATH);
  const stream = Readable.toWeb(
    createReadStream(ZIP_PATH),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": 'attachment; filename="yt-next-downloads.zip"',
    },
  });
}
