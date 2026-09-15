export type CsvRow = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === "," || char === "\t") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

const VIDEO_ID_RE = /^[\w-]{11}$/;

export function extractVideoIds(rows: CsvRow[]): {
  ids: string[];
  invalid: string[];
} {
  const seen = new Set<string>();
  const ids: string[] = [];
  const invalid: string[] = [];

  for (const row of rows) {
    const raw = row["Video ID"] ?? row["VideoId"] ?? row["video_id"] ?? "";
    if (!raw) continue;
    if (!VIDEO_ID_RE.test(raw)) {
      if (!invalid.includes(raw)) invalid.push(raw);
      continue;
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      ids.push(raw);
    }
  }

  return { ids, invalid };
}
