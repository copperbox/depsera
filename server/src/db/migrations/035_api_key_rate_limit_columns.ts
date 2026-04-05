import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-84a: Add rate_limit_rpm column — NULL = system default, 0 = unlimited (admin-only), N = custom rpm
  db.exec(`ALTER TABLE team_api_keys ADD COLUMN rate_limit_rpm INTEGER`);

  // DPS-84a: Add rate_limit_admin_locked column — 0 = unlocked, 1 = admin has locked against team edits
  db.exec(`ALTER TABLE team_api_keys ADD COLUMN rate_limit_admin_locked INTEGER NOT NULL DEFAULT 0`);
}

export function down(db: Database): void {
  db.exec(`ALTER TABLE team_api_keys DROP COLUMN rate_limit_admin_locked`);
  db.exec(`ALTER TABLE team_api_keys DROP COLUMN rate_limit_rpm`);
}
