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
    )
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
