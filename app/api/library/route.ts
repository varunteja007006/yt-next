import { clearLibrary, getLibrary, saveLibrary } from "@/lib/db";

export async function GET() {
  const library = getLibrary();
  return Response.json({ library });
}

export async function POST(request: Request) {
  let body: { name?: string; csv?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, csv } = body;
  if (typeof csv !== "string" || !csv.trim()) {
    return Response.json({ error: "csv required" }, { status: 400 });
  }
  const library = saveLibrary(
    typeof name === "string" && name.trim() ? name.trim() : "library",
    csv
  );
  return Response.json({ library });
}

export async function DELETE() {
  clearLibrary();
  return Response.json({ ok: true });
}
