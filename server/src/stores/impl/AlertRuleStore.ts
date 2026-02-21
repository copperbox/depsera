import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { AlertRule, CreateAlertRuleInput, UpdateAlertRuleInput } from '../../db/types';
import { IAlertRuleStore } from '../interfaces/IAlertRuleStore';

export class AlertRuleStore implements IAlertRuleStore {
  constructor(private db: Database) {}

  findById(id: string): AlertRule | undefined {
    return this.db
      .prepare('SELECT * FROM alert_rules WHERE id = ?')
      .get(id) as AlertRule | undefined;
  }

  findByTeamId(teamId: string): AlertRule[] {
    return this.db
      .prepare('SELECT * FROM alert_rules WHERE team_id = ? ORDER BY created_at DESC')
      .all(teamId) as AlertRule[];
  }

  findActiveByTeamId(teamId: string): AlertRule[] {
    return this.db
      .prepare('SELECT * FROM alert_rules WHERE team_id = ? AND is_active = 1 ORDER BY created_at DESC')
      .all(teamId) as AlertRule[];
  }

  create(input: CreateAlertRuleInput): AlertRule {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO alert_rules (id, team_id, severity_filter)
        VALUES (?, ?, ?)
      `)
      .run(id, input.team_id, input.severity_filter);

    return this.db
      .prepare('SELECT * FROM alert_rules WHERE id = ?')
      .get(id) as AlertRule;
  }

  update(id: string, input: UpdateAlertRuleInput): AlertRule | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: unknown[] = [];

    if (input.severity_filter !== undefined) {
      fields.push('severity_filter = ?');
      params.push(input.severity_filter);
    }
    if (input.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(input.is_active ? 1 : 0);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    params.push(id);

    this.db
      .prepare(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.db
      .prepare('SELECT * FROM alert_rules WHERE id = ?')
      .get(id) as AlertRule;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM alert_rules WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
