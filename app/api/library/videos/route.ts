import { VIDEO_ID_RE, removeVideoRows } from "@/lib/csv";
import { getLibrary, saveLibrary } from "@/lib/db";

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) {
    return Response.json({ error: "valid video id required" }, { status: 400 });
  }

  const library = getLibrary();
  if (!library || !library.csv.trim()) {
    return Response.json({ error: "no saved library" }, { status: 404 });
  }

  const { csv, removed } = removeVideoRows(library.csv, id);
  // Skip the write when nothing matched — the delete is idempotent.
  const updated = removed > 0 ? saveLibrary(library.name, csv) : library;
  return Response.json({ ok: true, removed, library: updated });
}
