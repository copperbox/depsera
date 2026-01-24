import { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      oidc_subject TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Teams table
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Team members junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Services table
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      health_endpoint TEXT NOT NULL,
      metrics_endpoint TEXT,
      polling_interval INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
    )
  `);

  // Dependencies table (stores dependency info from proactive-deps)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      impact TEXT,
      healthy INTEGER,
      health_state INTEGER,
      health_code INTEGER,
      latency_ms INTEGER,
      last_checked TEXT,
      last_status_change TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (service_id, name)
    )
  `);

  // Dependency associations table (links dependencies to other services)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dependency_associations (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      linked_service_id TEXT NOT NULL,
      association_type TEXT NOT NULL DEFAULT 'other' CHECK (association_type IN ('api_call', 'database', 'message_queue', 'cache', 'other')),
      is_auto_suggested INTEGER NOT NULL DEFAULT 0,
      confidence_score INTEGER,
      is_dismissed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (dependency_id, linked_service_id)
    )
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_services_team_id ON services(team_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_service_id ON dependencies(service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_healthy ON dependencies(healthy);
    CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_dependency_associations_dependency_id ON dependency_associations(dependency_id);
    CREATE INDEX IF NOT EXISTS idx_dependency_associations_linked_service_id ON dependency_associations(linked_service_id);
  `);
};

export const down = (db: Database): void => {
  db.exec(`
    DROP TABLE IF EXISTS dependency_associations;
    DROP TABLE IF EXISTS dependencies;
    DROP TABLE IF EXISTS services;
    DROP TABLE IF EXISTS team_members;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS users;
  `);
};
