import { mergeTakeoutCsvs } from "@/lib/takeout";

export const maxDuration = 60;

const MAX_FILES = 50;

export async function POST(request: Request) {
  let files: File[];
  try {
    const formData = await request.formData();
    files = [...formData.getAll("files")].filter(
      (entry): entry is File => entry instanceof File,
    );
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (files.length === 0) {
    return Response.json(
      { error: "No CSV files provided (field name: files)" },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES) {
    return Response.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json(
        { error: `Not a CSV file: ${file.name}` },
        { status: 400 },
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return Response.json(
        { error: `File too large (max 5 MB): ${file.name}` },
        { status: 413 },
      );
    }
  }

  const inputs = [];
  for (const file of files) {
    inputs.push({ name: file.name, text: await file.text() });
  }

  return Response.json(mergeTakeoutCsvs(inputs));
}
