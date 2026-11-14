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

export const VIDEO_ID_RE = /^[\w-]{11}$/;

// Quote only when the field would break the row: comma, quote or newline.
// Same rule as the takeout merge so round-trips stay consistent.
function csvField(value: string): string {
  return /[,\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(fields: string[]): string {
  return fields.map(csvField).join(",");
}

// Drop every row whose video-id column matches videoId and re-serialize.
// Header order comes from the first line; output keeps the trailing newline
// (header-only when no rows remain). Returns the original string untouched
// when nothing matched.
export function removeVideoRows(
  csv: string,
  videoId: string,
): { csv: string; removed: number } {
  const lines = csv
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { csv, removed: 0 };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idHeader = header.find(
    (h) => h === "Video ID" || h === "VideoId" || h === "video_id",
  );
  if (!idHeader) return { csv, removed: 0 };

  const rows = parseCsv(csv);
  const kept = rows.filter((row) => row[idHeader] !== videoId);
  const removed = rows.length - kept.length;
  if (removed === 0) return { csv, removed: 0 };

  const out = [
    csvLine(header),
    ...kept.map((row) => csvLine(header.map((h) => row[h] ?? ""))),
  ];
  return { csv: `${out.join("\n")}\n`, removed };
}

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
