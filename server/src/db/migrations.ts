import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function runMigrations(db: Database.Database): void {
  // Create schema_migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const appliedRows = db.prepare('SELECT migration_name FROM schema_migrations').all() as { migration_name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

  const migrationsDir = path.resolve(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (!appliedSet.has(file)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        db.transaction(() => {
          db.exec(sql);
          db.prepare('INSERT INTO schema_migrations (migration_name) VALUES (?)').run(file);
        })();
      }
    }
  }
}
