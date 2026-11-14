import { parseCsv } from "@/lib/csv";

// Column set/order mirrors youtube-music-video-ids-merged.csv exactly.
const MERGED_HEADER = [
  "Video ID",
  "Song Title",
  "Album Title",
  ...Array.from({ length: 9 }, (_, i) => `Artist Name ${i + 1}`),
  "Playlist Video Creation Timestamp",
  "Source File",
  "Source Type",
  "Duplicate Count",
  "Is Duplicate",
];

const MERGED_NAME = "youtube-music-video-ids-merged.csv";
const VIDEO_ID_RE = /^[\w-]{11}$/;
const MUSIC_LIBRARY_FILE = "music library songs.csv";

export type TakeoutStats = {
  files: number;
  rows: number;
  uniqueVideos: number;
  duplicates: number;
  invalid: number;
  sources: string[];
};

export type TakeoutMerge = {
  csv: string;
  name: string;
  stats: TakeoutStats;
};

type Occurrence = {
  videoId: string;
  songTitle: string;
  albumTitle: string;
  artists: string[];
  timestamp: string;
  sourceFile: string;
  sourceType: string;
};

// Music library files carry song/album/artist columns; playlist files only
// carry an ID and a timestamp. Detect by header, fall back to filename.
function isMusicLibrary(name: string, text: string): boolean {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  if (header.includes("Song Title")) return true;
  return name.split("/").pop() === MUSIC_LIBRARY_FILE;
}

// Quote only when the field would break the row: comma, quote or newline.
function csvField(value: string): string {
  return /[,\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(fields: string[]): string {
  return fields.map(csvField).join(",");
}

export function mergeTakeoutCsvs(
  files: Array<{ name: string; text: string }>,
): TakeoutMerge {
  const occurrences: Occurrence[] = [];
  const counts = new Map<string, number>();
  const sources: string[] = [];
  let invalid = 0;

  // Playlist rows first (files sorted by name), music library rows last —
  // same layout as the existing merged file.
  const playlists = files
    .filter((f) => !isMusicLibrary(f.name, f.text))
    .sort((a, b) => a.name.localeCompare(b.name));
  const musicLibraries = files.filter((f) => isMusicLibrary(f.name, f.text));

  for (const file of [...playlists, ...musicLibraries]) {
    const music = isMusicLibrary(file.name, file.text);
    const sourceFile = file.name.split("/").pop() ?? file.name;
    sources.push(sourceFile);

    for (const row of parseCsv(file.text)) {
      const videoId = (row["Video ID"] ?? "").trim();
      if (!videoId) continue;
      if (!VIDEO_ID_RE.test(videoId)) {
        invalid++;
        continue;
      }
      // Compact the non-empty artists into Artist Name 1..9; anything
      // beyond 9 slots is dropped.
      const artists = [];
      for (let i = 1; i <= 9; i++) {
        const artist = row[`Artist Name ${i}`] ?? "";
        if (artist) artists.push(artist);
      }
      occurrences.push({
        videoId,
        songTitle: music ? (row["Song Title"] ?? "") : "",
        albumTitle: music ? (row["Album Title"] ?? "") : "",
        artists,
        timestamp: row["Playlist Video Creation Timestamp"] ?? "",
        sourceFile,
        sourceType: music ? "Music library" : "Playlist",
      });
      counts.set(videoId, (counts.get(videoId) ?? 0) + 1);
    }
  }

  const lines = [csvLine(MERGED_HEADER)];
  for (const o of occurrences) {
    const count = counts.get(o.videoId) ?? 1;
    lines.push(
      csvLine([
        o.videoId,
        o.songTitle,
        o.albumTitle,
        ...Array.from({ length: 9 }, (_, i) => o.artists[i] ?? ""),
        o.timestamp,
        o.sourceFile,
        o.sourceType,
        String(count),
        count > 1 ? "Yes" : "No",
      ]),
    );
  }

  return {
    csv: `${lines.join("\n")}\n`,
    name: MERGED_NAME,
    stats: {
      files: files.length,
      rows: occurrences.length,
      uniqueVideos: counts.size,
      duplicates: [...counts.values()].filter((c) => c > 1).length,
      invalid,
      sources,
    },
  };
}
