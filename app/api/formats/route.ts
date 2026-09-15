import { getFormats } from "@/lib/formats";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get("videoId");
  const refresh = params.get("refresh") === "1";
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return Response.json({ error: "Invalid videoId" }, { status: 400 });
  }

  try {
    const { formats } = await getFormats(videoId, refresh);
    return Response.json({ formats });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list formats";
    return Response.json({ error: message }, { status: 502 });
  }
}
