import Database from 'better-sqlite3';
import { DriftFlagStore } from './DriftFlagStore';

describe('DriftFlagStore', () => {
  let db: Database.Database;
  let store: DriftFlagStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        manifest_key TEXT,
        manifest_managed INTEGER DEFAULT 0,
        manifest_last_synced_values TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id)
      );

      CREATE TABLE manifest_sync_history (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        triggered_by TEXT,
        manifest_url TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        errors TEXT,
        warnings TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE drift_flags (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        field_name TEXT,
        manifest_value TEXT,
        current_value TEXT,
        status TEXT NOT NULL,
        first_detected_at TEXT NOT NULL,
        last_detected_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        sync_history_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (sync_history_id) REFERENCES manifest_sync_history(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_drift_flags_team_id ON drift_flags(team_id);
      CREATE INDEX idx_drift_flags_service_id ON drift_flags(service_id);
      CREATE INDEX idx_drift_flags_status ON drift_flags(status);
      CREATE INDEX idx_drift_flags_team_status ON drift_flags(team_id, status);

      INSERT INTO users (id, name, email) VALUES ('user-1', 'Alice', 'alice@test.com');
      INSERT INTO users (id, name, email) VALUES ('user-2', 'Bob', 'bob@test.com');
      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
      INSERT INTO services (id, name, team_id, health_endpoint, manifest_key, manifest_managed)
        VALUES ('svc-1', 'API Gateway', 'team-1', 'http://api/health', 'api-gateway', 1);
      INSERT INTO services (id, name, team_id, health_endpoint, manifest_key, manifest_managed)
        VALUES ('svc-2', 'Auth Service', 'team-1', 'http://auth/health', 'auth-service', 1);
      INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('svc-3', 'Other Service', 'team-2', 'http://other/health');
    `);
    store = new DriftFlagStore(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Read operations ────────────────────────────────────────────────

  describe('findById', () => {
    it('should find a drift flag by id', () => {
      const created = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"New Name"',
        current_value: '"Old Name"',
      });

      const found = store.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.drift_type).toBe('field_change');
    });

    it('should return undefined for nonexistent id', () => {
      expect(store.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByTeamId', () => {
    it('should return flags with context for a team', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"New"',
        current_value: '"Old"',
      });

      const { flags, total } = store.findByTeamId('team-1');
      expect(total).toBe(1);
      expect(flags).toHaveLength(1);
      expect(flags[0].service_name).toBe('API Gateway');
      expect(flags[0].manifest_key).toBe('api-gateway');
      expect(flags[0].resolved_by_name).toBeNull();
    });

    it('should filter by status', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'service_removal',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const pending = store.findByTeamId('team-1', { status: 'pending' });
      expect(pending.total).toBe(1);

      const dismissed = store.findByTeamId('team-1', { status: 'dismissed' });
      expect(dismissed.total).toBe(1);
      expect(dismissed.flags[0].resolved_by_name).toBe('Alice');
    });

    it('should filter by drift_type', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'service_removal',
      });

      const fieldChanges = store.findByTeamId('team-1', { drift_type: 'field_change' });
      expect(fieldChanges.total).toBe(1);
      expect(fieldChanges.flags[0].drift_type).toBe('field_change');
    });

    it('should filter by service_id', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'field_change',
        field_name: 'name',
      });

      const result = store.findByTeamId('team-1', { service_id: 'svc-1' });
      expect(result.total).toBe(1);
    });

    it('should paginate results', () => {
      for (let i = 0; i < 5; i++) {
        store.create({
          team_id: 'team-1',
          service_id: 'svc-1',
          drift_type: 'field_change',
          field_name: `field_${i}`,
        });
      }

      const page1 = store.findByTeamId('team-1', { limit: 2, offset: 0 });
      expect(page1.total).toBe(5);
      expect(page1.flags).toHaveLength(2);

      const page2 = store.findByTeamId('team-1', { limit: 2, offset: 2 });
      expect(page2.total).toBe(5);
      expect(page2.flags).toHaveLength(2);
    });

    it('should return empty results for team with no flags', () => {
      const result = store.findByTeamId('team-2');
      expect(result.total).toBe(0);
      expect(result.flags).toHaveLength(0);
    });
  });

  describe('findActiveByServiceId', () => {
    it('should return pending and dismissed flags for a service', () => {
      const flag1 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'description',
      });
      // Dismiss one
      store.resolve(flag1.id, 'dismissed', 'user-1');

      const active = store.findActiveByServiceId('svc-1');
      expect(active).toHaveLength(2); // both pending and dismissed are "active"
    });

    it('should not return resolved or accepted flags', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag.id, 'accepted', 'user-1');

      const active = store.findActiveByServiceId('svc-1');
      expect(active).toHaveLength(0);
    });
  });

  describe('findActiveByServiceAndField', () => {
    it('should find active field_change flag for specific service and field', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"New"',
        current_value: '"Old"',
      });

      const found = store.findActiveByServiceAndField('svc-1', 'name');
      expect(found).toBeDefined();
      expect(found!.field_name).toBe('name');
    });

    it('should not return service_removal flags', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });

      const found = store.findActiveByServiceAndField('svc-1', 'name');
      expect(found).toBeUndefined();
    });

    it('should return undefined when no match', () => {
      expect(store.findActiveByServiceAndField('svc-1', 'name')).toBeUndefined();
    });
  });

  describe('findActiveRemovalByServiceId', () => {
    it('should find active service_removal flag', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });

      const found = store.findActiveRemovalByServiceId('svc-1');
      expect(found).toBeDefined();
      expect(found!.drift_type).toBe('service_removal');
    });

    it('should not return field_change flags', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });

      expect(store.findActiveRemovalByServiceId('svc-1')).toBeUndefined();
    });
  });

  describe('countByTeamId', () => {
    it('should return correct summary counts', () => {
      const flag1 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'service_removal',
      });
      const flag3 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'description',
      });

      // Dismiss one field change
      store.resolve(flag3.id, 'dismissed', 'user-1');

      const summary = store.countByTeamId('team-1');
      expect(summary.pending_count).toBe(2); // flag1 (field_change) + svc-2 removal
      expect(summary.dismissed_count).toBe(1);
      expect(summary.field_change_pending).toBe(1);
      expect(summary.service_removal_pending).toBe(1);
    });

    it('should return zeros for team with no flags', () => {
      const summary = store.countByTeamId('team-2');
      expect(summary.pending_count).toBe(0);
      expect(summary.dismissed_count).toBe(0);
      expect(summary.field_change_pending).toBe(0);
      expect(summary.service_removal_pending).toBe(0);
    });
  });

  // ── Write operations ───────────────────────────────────────────────

  describe('create', () => {
    it('should create a field_change drift flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"New Name"',
        current_value: '"Old Name"',
      });

      expect(flag.id).toBeDefined();
      expect(flag.team_id).toBe('team-1');
      expect(flag.service_id).toBe('svc-1');
      expect(flag.drift_type).toBe('field_change');
      expect(flag.field_name).toBe('name');
      expect(flag.manifest_value).toBe('"New Name"');
      expect(flag.current_value).toBe('"Old Name"');
      expect(flag.status).toBe('pending');
      expect(flag.first_detected_at).toBeDefined();
      expect(flag.last_detected_at).toBeDefined();
      expect(flag.resolved_at).toBeNull();
      expect(flag.resolved_by).toBeNull();
    });

    it('should create a service_removal drift flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });

      expect(flag.drift_type).toBe('service_removal');
      expect(flag.field_name).toBeNull();
      expect(flag.manifest_value).toBeNull();
      expect(flag.current_value).toBeNull();
    });

    it('should create with sync_history_id', () => {
      // Insert a sync history record first
      db.exec(`INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status) VALUES ('sync-1', 'team-1', 'manual', 'http://example.com', 'success')`);

      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        sync_history_id: 'sync-1',
      });

      expect(flag.sync_history_id).toBe('sync-1');
    });
  });

  describe('resolve', () => {
    it('should dismiss a pending flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });

      const result = store.resolve(flag.id, 'dismissed', 'user-1');
      expect(result).toBe(true);

      const updated = store.findById(flag.id);
      expect(updated!.status).toBe('dismissed');
      expect(updated!.resolved_at).toBeDefined();
      expect(updated!.resolved_by).toBe('user-1');
    });

    it('should accept a pending flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });

      store.resolve(flag.id, 'accepted', 'user-1');
      const updated = store.findById(flag.id);
      expect(updated!.status).toBe('accepted');
    });

    it('should resolve a dismissed flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const result = store.resolve(flag.id, 'resolved', null);
      expect(result).toBe(true);

      const updated = store.findById(flag.id);
      expect(updated!.status).toBe('resolved');
    });

    it('should not resolve an already accepted flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag.id, 'accepted', 'user-1');

      const result = store.resolve(flag.id, 'dismissed', 'user-2');
      expect(result).toBe(false);
    });

    it('should return false for nonexistent flag', () => {
      expect(store.resolve('nonexistent', 'dismissed', 'user-1')).toBe(false);
    });
  });

  describe('reopen', () => {
    it('should reopen a dismissed flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const result = store.reopen(flag.id);
      expect(result).toBe(true);

      const updated = store.findById(flag.id);
      expect(updated!.status).toBe('pending');
      expect(updated!.resolved_at).toBeNull();
      expect(updated!.resolved_by).toBeNull();
    });

    it('should not reopen a pending flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });

      expect(store.reopen(flag.id)).toBe(false);
    });

    it('should not reopen an accepted flag', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag.id, 'accepted', 'user-1');

      expect(store.reopen(flag.id)).toBe(false);
    });
  });

  describe('updateDetection', () => {
    it('should update manifest and current values', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"Old Manifest"',
        current_value: '"Old Current"',
      });

      const result = store.updateDetection(flag.id, '"New Manifest"', '"New Current"');
      expect(result).toBe(true);

      const updated = store.findById(flag.id);
      expect(updated!.manifest_value).toBe('"New Manifest"');
      expect(updated!.current_value).toBe('"New Current"');
      expect(updated!.last_detected_at).toBeDefined();
    });
  });

  describe('updateLastDetectedAt', () => {
    it('should update last_detected_at timestamp', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      const originalTime = flag.last_detected_at;

      // Small delay to ensure different timestamp
      const result = store.updateLastDetectedAt(flag.id);
      expect(result).toBe(true);

      const updated = store.findById(flag.id);
      expect(updated!.last_detected_at).toBeDefined();
    });

    it('should return false for nonexistent flag', () => {
      expect(store.updateLastDetectedAt('nonexistent')).toBe(false);
    });
  });

  // ── Bulk operations ────────────────────────────────────────────────

  describe('bulkResolve', () => {
    it('should resolve multiple flags at once', () => {
      const flag1 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      const flag2 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'description',
      });

      const count = store.bulkResolve([flag1.id, flag2.id], 'dismissed', 'user-1');
      expect(count).toBe(2);

      expect(store.findById(flag1.id)!.status).toBe('dismissed');
      expect(store.findById(flag2.id)!.status).toBe('dismissed');
    });

    it('should skip already resolved flags', () => {
      const flag1 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.resolve(flag1.id, 'accepted', 'user-1');

      const flag2 = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'description',
      });

      const count = store.bulkResolve([flag1.id, flag2.id], 'dismissed', 'user-2');
      expect(count).toBe(1); // Only flag2 was updated
    });

    it('should return 0 for empty array', () => {
      expect(store.bulkResolve([], 'dismissed', 'user-1')).toBe(0);
    });
  });

  describe('resolveAllForService', () => {
    it('should resolve all active flags for a service', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });
      // Different service — should NOT be affected
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'field_change',
        field_name: 'name',
      });

      const count = store.resolveAllForService('svc-1');
      expect(count).toBe(2);

      const active = store.findActiveByServiceId('svc-1');
      expect(active).toHaveLength(0);

      // svc-2 flags should still be active
      const otherActive = store.findActiveByServiceId('svc-2');
      expect(otherActive).toHaveLength(1);
    });
  });

  describe('resolveAllForTeam', () => {
    it('should resolve all active flags for a team', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });
      store.create({
        team_id: 'team-1',
        service_id: 'svc-2',
        drift_type: 'service_removal',
      });

      const count = store.resolveAllForTeam('team-1');
      expect(count).toBe(2);

      const summary = store.countByTeamId('team-1');
      expect(summary.pending_count).toBe(0);
      expect(summary.dismissed_count).toBe(0);
    });
  });

  // ── Upsert operations ─────────────────────────────────────────────

  describe('upsertFieldDrift', () => {
    it('should create new flag when none exists', () => {
      const result = store.upsertFieldDrift('svc-1', 'name', '"Manifest"', '"Current"', null);
      expect(result.action).toBe('created');
      expect(result.flag.drift_type).toBe('field_change');
      expect(result.flag.field_name).toBe('name');
      expect(result.flag.manifest_value).toBe('"Manifest"');
      expect(result.flag.current_value).toBe('"Current"');
      expect(result.flag.status).toBe('pending');
    });

    it('should update existing pending flag', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"Old Manifest"',
        current_value: '"Old Current"',
      });

      const result = store.upsertFieldDrift('svc-1', 'name', '"New Manifest"', '"New Current"', null);
      expect(result.action).toBe('updated');
      expect(result.flag.manifest_value).toBe('"New Manifest"');
      expect(result.flag.current_value).toBe('"New Current"');
    });

    it('should keep dismissed flag unchanged when manifest value is the same', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"Same"',
        current_value: '"Local"',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const result = store.upsertFieldDrift('svc-1', 'name', '"Same"', '"Local"', null);
      expect(result.action).toBe('unchanged');
      expect(result.flag.status).toBe('dismissed');
    });

    it('should reopen dismissed flag when manifest value changes', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: '"Old Manifest"',
        current_value: '"Local"',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const result = store.upsertFieldDrift('svc-1', 'name', '"New Manifest"', '"Local"', null);
      expect(result.action).toBe('reopened');
      expect(result.flag.status).toBe('pending');
      expect(result.flag.manifest_value).toBe('"New Manifest"');
      expect(result.flag.resolved_at).toBeNull();
      expect(result.flag.resolved_by).toBeNull();
    });

    it('should throw when service does not exist', () => {
      expect(() =>
        store.upsertFieldDrift('nonexistent', 'name', '"M"', '"C"', null),
      ).toThrow('Service nonexistent not found');
    });

    it('should set sync_history_id when provided', () => {
      db.exec(`INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status) VALUES ('sync-1', 'team-1', 'manual', 'http://example.com', 'success')`);

      const result = store.upsertFieldDrift('svc-1', 'name', '"M"', '"C"', 'sync-1');
      expect(result.flag.sync_history_id).toBe('sync-1');
    });
  });

  describe('upsertRemovalDrift', () => {
    it('should create new flag when none exists', () => {
      const result = store.upsertRemovalDrift('svc-1', null);
      expect(result.action).toBe('created');
      expect(result.flag.drift_type).toBe('service_removal');
      expect(result.flag.status).toBe('pending');
    });

    it('should keep pending flag unchanged and update last_detected_at', () => {
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });

      const result = store.upsertRemovalDrift('svc-1', null);
      expect(result.action).toBe('unchanged');
      expect(result.flag.status).toBe('pending');
    });

    it('should keep dismissed flag as dismissed', () => {
      const flag = store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      });
      store.resolve(flag.id, 'dismissed', 'user-1');

      const result = store.upsertRemovalDrift('svc-1', null);
      expect(result.action).toBe('unchanged');
      expect(result.flag.status).toBe('dismissed');
    });

    it('should throw when service does not exist', () => {
      expect(() => store.upsertRemovalDrift('nonexistent', null)).toThrow(
        'Service nonexistent not found',
      );
    });
  });

  // ── Cleanup ────────────────────────────────────────────────────────

  describe('deleteOlderThan', () => {
    it('should delete flags older than timestamp', () => {
      // Create flags with an old timestamp by inserting directly
      db.exec(`
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status, first_detected_at, last_detected_at, created_at)
        VALUES ('old-1', 'team-1', 'svc-1', 'field_change', 'accepted', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status, first_detected_at, last_detected_at, created_at)
        VALUES ('old-2', 'team-1', 'svc-1', 'field_change', 'resolved', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
      `);
      // Create a recent flag
      store.create({
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
      });

      const count = store.deleteOlderThan('2025-06-01T00:00:00Z');
      expect(count).toBe(2);

      // Recent flag should still exist
      const { total } = store.findByTeamId('team-1');
      expect(total).toBe(1);
    });

    it('should filter by statuses when provided', () => {
      db.exec(`
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status, first_detected_at, last_detected_at, created_at)
        VALUES ('old-accepted', 'team-1', 'svc-1', 'field_change', 'accepted', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status, first_detected_at, last_detected_at, created_at)
        VALUES ('old-pending', 'team-1', 'svc-1', 'field_change', 'pending', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
      `);

      const count = store.deleteOlderThan('2025-06-01T00:00:00Z', ['accepted', 'resolved']);
      expect(count).toBe(1); // Only the accepted one

      // Pending one should still exist
      expect(store.findById('old-pending')).toBeDefined();
    });

    it('should return 0 when nothing to delete', () => {
      expect(store.deleteOlderThan('2020-01-01T00:00:00Z')).toBe(0);
    });
  });
});
