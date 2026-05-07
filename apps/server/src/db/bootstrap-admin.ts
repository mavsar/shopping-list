import type Database from "better-sqlite3";

import { hashPassword } from "../auth/session.js";

export function ensureBootstrapAdmin(sqlite: Database.Database): void {
  const existingAdmin = sqlite.prepare("SELECT id FROM users WHERE is_admin = 1 LIMIT 1").get();
  if (existingAdmin) {
    return;
  }

  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin12345";
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrator").trim();
  const passwordHash = hashPassword(password);

  sqlite
    .prepare("INSERT INTO users (username, name, email, password_hash, is_admin) VALUES (?, ?, NULL, ?, 1)")
    .run(username, name, passwordHash);

  console.log(`Bootstrap admin created with username "${username}". Please change the password immediately.`);
}
