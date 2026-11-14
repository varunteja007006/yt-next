import { getSetting, setSetting } from "@/lib/db";

const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 1.5;

function clampFontScale(value: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
}

export async function GET() {
  const raw = getSetting("font_scale");
  if (raw === undefined) return Response.json({ fontScale: null });
  const parsed = Number(raw);
  const fontScale = Number.isFinite(parsed) ? clampFontScale(parsed) : null;
  return Response.json({ fontScale });
}

export async function PUT(request: Request) {
  let body: { fontScale?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { fontScale } = body;
  if (typeof fontScale !== "number" || !Number.isFinite(fontScale)) {
    return Response.json({ error: "fontScale required" }, { status: 400 });
  }
  const clamped = clampFontScale(fontScale);
  setSetting("font_scale", String(clamped));
  return Response.json({ fontScale: clamped });
}
