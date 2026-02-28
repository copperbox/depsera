import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import type {
  DriftFlag,
  DriftFlagWithContext,
  DriftFlagCreateInput,
  DriftFlagStatus,
  DriftSummary,
  DriftFlagUpsertResult,
} from '../../db/types';
import type { IDriftFlagStore, DriftFlagListOptions } from '../interfaces/IDriftFlagStore';

export class DriftFlagStore implements IDriftFlagStore {
  constructor(private db: Database) {}

  // ── Read operations ──────────────────────────────────────────────────

  findById(id: string): DriftFlag | undefined {
    return this.db
      .prepare('SELECT * FROM drift_flags WHERE id = ?')
      .get(id) as DriftFlag | undefined;
  }

  findByTeamId(
    teamId: string,
    options?: DriftFlagListOptions,
  ): { flags: DriftFlagWithContext[]; total: number } {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 250);
    const offset = Math.max(options?.offset ?? 0, 0);

    const conditions: string[] = ['df.team_id = ?'];
    const params: unknown[] = [teamId];

    if (options?.status) {
      conditions.push('df.status = ?');
      params.push(options.status);
    }
    if (options?.drift_type) {
      conditions.push('df.drift_type = ?');
      params.push(options.drift_type);
    }
    if (options?.service_id) {
      conditions.push('df.service_id = ?');
      params.push(options.service_id);
    }

    const where = conditions.join(' AND ');

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM drift_flags df WHERE ${where}`)
        .get(...params) as { count: number }
    ).count;

    const flags = this.db
      .prepare(
        `SELECT df.*, s.name AS service_name, s.manifest_key, u.name AS resolved_by_name
         FROM drift_flags df
         JOIN services s ON s.id = df.service_id
         LEFT JOIN users u ON u.id = df.resolved_by
         WHERE ${where}
         ORDER BY df.last_detected_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as DriftFlagWithContext[];

    return { flags, total };
  }

  findActiveByServiceId(serviceId: string): DriftFlag[] {
    return this.db
      .prepare(
        `SELECT * FROM drift_flags
         WHERE service_id = ? AND status IN ('pending', 'dismissed')
         ORDER BY last_detected_at DESC`,
      )
      .all(serviceId) as DriftFlag[];
  }

  findActiveByServiceAndField(
    serviceId: string,
    fieldName: string,
  ): DriftFlag | undefined {
    return this.db
      .prepare(
        `SELECT * FROM drift_flags
         WHERE service_id = ? AND field_name = ? AND drift_type = 'field_change'
           AND status IN ('pending', 'dismissed')
         LIMIT 1`,
      )
      .get(serviceId, fieldName) as DriftFlag | undefined;
  }

  findActiveRemovalByServiceId(serviceId: string): DriftFlag | undefined {
    return this.db
      .prepare(
        `SELECT * FROM drift_flags
         WHERE service_id = ? AND drift_type = 'service_removal'
           AND status IN ('pending', 'dismissed')
         LIMIT 1`,
      )
      .get(serviceId) as DriftFlag | undefined;
  }

  countByTeamId(teamId: string): DriftSummary {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count,
           SUM(CASE WHEN status = 'pending' AND drift_type = 'field_change' THEN 1 ELSE 0 END) AS field_change_pending,
           SUM(CASE WHEN status = 'pending' AND drift_type = 'service_removal' THEN 1 ELSE 0 END) AS service_removal_pending
         FROM drift_flags
         WHERE team_id = ?`,
      )
      .get(teamId) as {
      pending_count: number | null;
      dismissed_count: number | null;
      field_change_pending: number | null;
      service_removal_pending: number | null;
    };

    return {
      pending_count: row.pending_count ?? 0,
      dismissed_count: row.dismissed_count ?? 0,
      field_change_pending: row.field_change_pending ?? 0,
      service_removal_pending: row.service_removal_pending ?? 0,
    };
  }

  // ── Write operations ─────────────────────────────────────────────────

  create(input: DriftFlagCreateInput): DriftFlag {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO drift_flags
           (id, team_id, service_id, drift_type, field_name, manifest_value, current_value,
            status, first_detected_at, last_detected_at, sync_history_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.team_id,
        input.service_id,
        input.drift_type,
        input.field_name ?? null,
        input.manifest_value ?? null,
        input.current_value ?? null,
        now,
        now,
        input.sync_history_id ?? null,
        now,
      );

    return this.findById(id)!;
  }

  resolve(
    id: string,
    status: 'dismissed' | 'accepted' | 'resolved',
    userId: string | null,
  ): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET status = ?, resolved_at = ?, resolved_by = ?
         WHERE id = ? AND status IN ('pending', 'dismissed')`,
      )
      .run(status, now, userId, id);
    return result.changes > 0;
  }

  reopen(id: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET status = 'pending', resolved_at = NULL, resolved_by = NULL
         WHERE id = ? AND status = 'dismissed'`,
      )
      .run(id);
    return result.changes > 0;
  }

  updateDetection(
    id: string,
    manifestValue: string | null,
    currentValue: string | null,
  ): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET manifest_value = ?, current_value = ?, last_detected_at = ?
         WHERE id = ?`,
      )
      .run(manifestValue, currentValue, now, id);
    return result.changes > 0;
  }

  updateLastDetectedAt(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE drift_flags SET last_detected_at = ? WHERE id = ?')
      .run(now, id);
    return result.changes > 0;
  }

  // ── Bulk operations ──────────────────────────────────────────────────

  bulkResolve(
    ids: string[],
    status: 'dismissed' | 'accepted' | 'resolved',
    userId: string | null,
  ): number {
    if (ids.length === 0) return 0;

    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET status = ?, resolved_at = ?, resolved_by = ?
         WHERE id IN (${placeholders}) AND status IN ('pending', 'dismissed')`,
      )
      .run(status, now, userId, ...ids);
    return result.changes;
  }

  resolveAllForService(serviceId: string): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET status = 'resolved', resolved_at = ?
         WHERE service_id = ? AND status IN ('pending', 'dismissed')`,
      )
      .run(now, serviceId);
    return result.changes;
  }

  resolveAllForTeam(teamId: string): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE drift_flags
         SET status = 'resolved', resolved_at = ?
         WHERE team_id = ? AND status IN ('pending', 'dismissed')`,
      )
      .run(now, teamId);
    return result.changes;
  }

  // ── Upsert operations (sync engine) ──────────────────────────────────

  upsertFieldDrift(
    serviceId: string,
    fieldName: string,
    manifestValue: string,
    currentValue: string,
    syncHistoryId: string | null,
  ): DriftFlagUpsertResult {
    const existing = this.findActiveByServiceAndField(serviceId, fieldName);

    if (!existing) {
      // Not found → create new pending flag
      const service = this.db
        .prepare('SELECT team_id FROM services WHERE id = ?')
        .get(serviceId) as { team_id: string } | undefined;
      if (!service) throw new Error(`Service ${serviceId} not found`);

      const flag = this.create({
        team_id: service.team_id,
        service_id: serviceId,
        drift_type: 'field_change',
        field_name: fieldName,
        manifest_value: manifestValue,
        current_value: currentValue,
        sync_history_id: syncHistoryId ?? undefined,
      });
      return { action: 'created', flag };
    }

    if (existing.status === 'pending') {
      // Pending exists → update values and last_detected_at
      this.updateDetection(existing.id, manifestValue, currentValue);
      if (syncHistoryId) {
        this.db
          .prepare('UPDATE drift_flags SET sync_history_id = ? WHERE id = ?')
          .run(syncHistoryId, existing.id);
      }
      return { action: 'updated', flag: this.findById(existing.id)! };
    }

    // Status is 'dismissed'
    if (existing.manifest_value === manifestValue) {
      // Same manifest value → update last_detected_at only (stay dismissed)
      this.updateLastDetectedAt(existing.id);
      if (syncHistoryId) {
        this.db
          .prepare('UPDATE drift_flags SET sync_history_id = ? WHERE id = ?')
          .run(syncHistoryId, existing.id);
      }
      return { action: 'unchanged', flag: this.findById(existing.id)! };
    }

    // Different manifest value → re-flag as pending
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE drift_flags
         SET status = 'pending', manifest_value = ?, current_value = ?,
             last_detected_at = ?, resolved_at = NULL, resolved_by = NULL,
             sync_history_id = ?
         WHERE id = ?`,
      )
      .run(manifestValue, currentValue, now, syncHistoryId, existing.id);
    return { action: 'reopened', flag: this.findById(existing.id)! };
  }

  upsertRemovalDrift(
    serviceId: string,
    syncHistoryId: string | null,
  ): DriftFlagUpsertResult {
    const existing = this.findActiveRemovalByServiceId(serviceId);

    if (!existing) {
      // Not found → create new pending flag
      const service = this.db
        .prepare('SELECT team_id FROM services WHERE id = ?')
        .get(serviceId) as { team_id: string } | undefined;
      if (!service) throw new Error(`Service ${serviceId} not found`);

      const flag = this.create({
        team_id: service.team_id,
        service_id: serviceId,
        drift_type: 'service_removal',
        sync_history_id: syncHistoryId ?? undefined,
      });
      return { action: 'created', flag };
    }

    // Pending or dismissed → update last_detected_at (stay in current status)
    this.updateLastDetectedAt(existing.id);
    if (syncHistoryId) {
      this.db
        .prepare('UPDATE drift_flags SET sync_history_id = ? WHERE id = ?')
        .run(syncHistoryId, existing.id);
    }
    return { action: 'unchanged', flag: this.findById(existing.id)! };
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  deleteOlderThan(timestamp: string, statuses?: DriftFlagStatus[]): number {
    if (statuses && statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(', ');
      const result = this.db
        .prepare(
          `DELETE FROM drift_flags
           WHERE created_at < ? AND status IN (${placeholders})`,
        )
        .run(timestamp, ...statuses);
      return result.changes;
    }

    const result = this.db
      .prepare('DELETE FROM drift_flags WHERE created_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
