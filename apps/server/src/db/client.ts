import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { ensureBootstrapAdmin } from "./bootstrap-admin.js";
import { runMigrations } from "./migrations.js";

const databasePath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "shopping-list.db");

const databaseDirectory = path.dirname(databasePath);
if (!fs.existsSync(databaseDirectory)) {
  fs.mkdirSync(databaseDirectory, { recursive: true });
}

export const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

runMigrations(sqlite);
ensureBootstrapAdmin(sqlite);
