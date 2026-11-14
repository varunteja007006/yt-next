import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "yt-next.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS library (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      csv TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS download_entries (
      video_id TEXT NOT NULL,
      format_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'in_progress', 'done', 'failed')),
      mode TEXT,
      itag TEXT,
      file TEXT,
      size_bytes INTEGER,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      PRIMARY KEY (video_id, format_key)
    );
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

export type LibraryRecord = { name: string; csv: string; updatedAt: string };

export function getLibrary(): LibraryRecord | null {
  const row = getDb()
    .prepare("SELECT name, csv, updated_at FROM library WHERE id = 1")
    .get() as { name: string; csv: string; updated_at: string } | undefined;
  if (!row) return null;
  return { name: row.name, csv: row.csv, updatedAt: row.updated_at };
}

export function saveLibrary(name: string, csv: string): LibraryRecord {
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO library (id, name, csv, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, csv = excluded.csv, updated_at = excluded.updated_at`
    )
    .run(name, csv, updatedAt);
  return { name, csv, updatedAt };
}

export function clearLibrary(): void {
  getDb().prepare("DELETE FROM library WHERE id = 1").run();
}

export type DownloadEntryRow = {
  video_id: string;
  format_key: string;
  label: string;
  status: string;
  mode: string | null;
  itag: string | null;
  file: string | null;
  size_bytes: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export function getAllDownloadEntries(): DownloadEntryRow[] {
  return getDb()
    .prepare(
      `SELECT video_id, format_key, label, status, mode, itag, file, size_bytes, error, started_at, finished_at
       FROM download_entries`
    )
    .all() as DownloadEntryRow[];
}

export function countDownloadEntries(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM download_entries")
    .get() as { n: number };
  return row.n;
}

export function upsertDownloadEntry(entry: DownloadEntryRow): void {
  getDb()
    .prepare(
      `INSERT INTO download_entries (video_id, format_key, label, status, mode, itag, file, size_bytes, error, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(video_id, format_key) DO UPDATE SET
         label = excluded.label,
         status = excluded.status,
         mode = excluded.mode,
         itag = excluded.itag,
         file = excluded.file,
         size_bytes = excluded.size_bytes,
         error = excluded.error,
         started_at = excluded.started_at,
         finished_at = excluded.finished_at`
    )
    .run(
      entry.video_id,
      entry.format_key,
      entry.label,
      entry.status,
      entry.mode,
      entry.itag,
      entry.file,
      entry.size_bytes,
      entry.error,
      entry.started_at,
      entry.finished_at
    );
}

export function deleteDownloadEntry(videoId: string, formatKey: string): void {
  getDb()
    .prepare("DELETE FROM download_entries WHERE video_id = ? AND format_key = ?")
    .run(videoId, formatKey);
}

export function getCache(key: string): { value: string; fetchedAt: string } | undefined {
  const row = getDb()
    .prepare("SELECT value, fetched_at FROM cache WHERE key = ?")
    .get(key) as { value: string; fetched_at: string } | undefined;
  if (!row) return undefined;
  return { value: row.value, fetchedAt: row.fetched_at };
}

export function setCache(key: string, value: string, fetchedAt?: string): void {
  const at = fetchedAt ?? new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO cache (key, value, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`
    )
    .run(key, value, at);
}

export function deleteCache(key: string): void {
  getDb().prepare("DELETE FROM cache WHERE key = ?").run(key);
}
