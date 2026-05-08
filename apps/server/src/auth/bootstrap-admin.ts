import { hashPassword } from "./session.js";
import { sqlite } from "../db/client.js";

type ExistingUser = {
  id: number;
};

export function ensureBootstrapAdmin(): void {
  const bootstrapUsername = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin").trim();
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin12345";
  const bootstrapName = (process.env.BOOTSTRAP_ADMIN_NAME ?? "Admin").trim();

  if (bootstrapUsername.length < 3 || bootstrapPassword.length < 8 || bootstrapName.length === 0) {
    console.warn("Skipping admin bootstrap: invalid BOOTSTRAP_ADMIN_* values.");
    return;
  }

  const [{ adminCount }] = sqlite.prepare("SELECT COUNT(*) AS adminCount FROM users WHERE is_admin = 1").all() as Array<{
    adminCount: number;
  }>;

  if (adminCount > 0) {
    return;
  }

  const passwordHash = hashPassword(bootstrapPassword);
  const existingUser = sqlite
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(bootstrapUsername) as ExistingUser | undefined;

  if (existingUser) {
    sqlite
      .prepare("UPDATE users SET name = ?, password_hash = ?, is_admin = 1 WHERE id = ?")
      .run(bootstrapName, passwordHash, existingUser.id);
    console.log(`Promoted existing user "${bootstrapUsername}" to bootstrap admin.`);
    return;
  }

  sqlite
    .prepare("INSERT INTO users (username, name, email, password_hash, is_admin) VALUES (?, ?, NULL, ?, 1)")
    .run(bootstrapUsername, bootstrapName, passwordHash);
  console.log(`Created bootstrap admin user "${bootstrapUsername}".`);
}
