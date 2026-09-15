import { extractVideoIds, parseCsv } from "@/lib/csv";
import { fetchMetadata } from "@/lib/youtube";

export const maxDuration = 60;

export async function POST(request: Request) {
  let csv: string;
  try {
    const body = await request.json();
    csv = body?.csv;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof csv !== "string" || csv.trim().length === 0) {
    return Response.json({ error: "Empty CSV file" }, { status: 400 });
  }

  if (csv.length > 5 * 1024 * 1024) {
    return Response.json({ error: "CSV too large (max 5 MB)" }, { status: 413 });
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return Response.json(
      { error: "Could not parse any rows from the CSV" },
      { status: 400 }
    );
  }

  const { ids, invalid } = extractVideoIds(rows);
  if (ids.length === 0) {
    return Response.json(
      { error: "No valid video IDs found in the CSV" },
      { status: 400 }
    );
  }

  try {
    const { videos, notFound } = await fetchMetadata(ids);
    return Response.json({
      videos,
      notFound,
      invalid,
      totalRows: rows.length,
      uniqueIds: ids.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch metadata";
    return Response.json({ error: message }, { status: 502 });
  }
}
