import type Database from "better-sqlite3";

type Migration = {
  name: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    name: "001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS shopping_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS list_members (
        list_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner', 'editor', 'viewer')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (list_id, user_id),
        FOREIGN KEY(list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_title TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        image_url TEXT,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT NOT NULL CHECK(unit IN ('kg', 'g', 'L', 'dl', 'pcs')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'removed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_items_normalized_title ON items(normalized_title);
      CREATE INDEX IF NOT EXISTS idx_list_items_list_id_status ON list_items(list_id, status);
      CREATE INDEX IF NOT EXISTS idx_list_items_item_id ON list_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_list_members_user_id ON list_members(user_id);
    `
  },
  {
    name: "002_auth_sessions",
    sql: `
      ALTER TABLE users ADD COLUMN password_hash TEXT;

      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
    `
  },
  {
    name: "003_usernames_and_admin",
    sql: `
      ALTER TABLE users ADD COLUMN username TEXT;
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

      UPDATE users
      SET username = 'user' || id
      WHERE username IS NULL OR username = '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);
    `
  },
  {
    name: "004_list_item_note",
    sql: `
      ALTER TABLE list_items ADD COLUMN note TEXT;
    `
  },
  {
    name: "005_items_category",
    sql: `
      ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
      CHECK(category IN (
        'vegetables', 'fruit', 'bread', 'dairy', 'meat', 'fish',
        'sweets', 'chocolate', 'flour_baking', 'canned', 'beverages',
        'frozen', 'pantry', 'other'
      ));
    `
  },
  {
    name: "006_items_category_eggs_split",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE IF NOT EXISTS items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_title TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        image_url TEXT,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        category TEXT NOT NULL DEFAULT 'other'
        CHECK(category IN (
          'vegetables', 'fruit', 'bread', 'dairy', 'eggs', 'meat', 'fish',
          'sweets', 'chocolate', 'flour_baking', 'canned', 'beverages',
          'frozen', 'pantry', 'other'
        ))
      );

      INSERT INTO items_new (id, normalized_title, title, image_url, source_url, created_at, updated_at, category)
      SELECT id, normalized_title, title, image_url, source_url, created_at, updated_at, category
      FROM items;

      UPDATE items_new
      SET category = 'eggs', updated_at = CURRENT_TIMESTAMP
      WHERE category = 'dairy'
        AND (
          normalized_title LIKE '%jajc%'
          OR normalized_title LIKE '%egg%'
        );

      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;

      CREATE INDEX IF NOT EXISTS idx_items_normalized_title ON items(normalized_title);

      PRAGMA foreign_keys = ON;
    `
  }
];

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hasMigration = sqlite.prepare("SELECT 1 FROM app_migrations WHERE name = ? LIMIT 1");
  const insertMigration = sqlite.prepare("INSERT INTO app_migrations (name) VALUES (?)");

  for (const migration of migrations) {
    const exists = hasMigration.get(migration.name);
    if (exists) {
      continue;
    }

    if (migration.name === "006_items_category_eggs_split") {
      // This migration rebuilds `items` table; run outside transaction so foreign key pragma can take effect.
      sqlite.exec("PRAGMA foreign_keys = OFF;");
      try {
        sqlite.exec(migration.sql);
        insertMigration.run(migration.name);
      } finally {
        sqlite.exec("PRAGMA foreign_keys = ON;");
      }
      continue;
    }

    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      insertMigration.run(migration.name);
    });

    applyMigration();
  }
}
