import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { AlertChannel, CreateAlertChannelInput, UpdateAlertChannelInput } from '../../db/types';
import { IAlertChannelStore } from '../interfaces/IAlertChannelStore';

export class AlertChannelStore implements IAlertChannelStore {
  constructor(private db: Database) {}

  findById(id: string): AlertChannel | undefined {
    return this.db
      .prepare('SELECT * FROM alert_channels WHERE id = ?')
      .get(id) as AlertChannel | undefined;
  }

  findByTeamId(teamId: string): AlertChannel[] {
    return this.db
      .prepare('SELECT * FROM alert_channels WHERE team_id = ? ORDER BY created_at DESC')
      .all(teamId) as AlertChannel[];
  }

  findActiveByTeamId(teamId: string): AlertChannel[] {
    return this.db
      .prepare('SELECT * FROM alert_channels WHERE team_id = ? AND is_active = 1 ORDER BY created_at DESC')
      .all(teamId) as AlertChannel[];
  }

  create(input: CreateAlertChannelInput): AlertChannel {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES (?, ?, ?, ?)
      `)
      .run(id, input.team_id, input.channel_type, input.config);

    return this.db
      .prepare('SELECT * FROM alert_channels WHERE id = ?')
      .get(id) as AlertChannel;
  }

  update(id: string, input: UpdateAlertChannelInput): AlertChannel | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: unknown[] = [];

    if (input.channel_type !== undefined) {
      fields.push('channel_type = ?');
      params.push(input.channel_type);
    }
    if (input.config !== undefined) {
      fields.push('config = ?');
      params.push(input.config);
    }
    if (input.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(input.is_active ? 1 : 0);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    params.push(id);

    this.db
      .prepare(`UPDATE alert_channels SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.db
      .prepare('SELECT * FROM alert_channels WHERE id = ?')
      .get(id) as AlertChannel;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM alert_channels WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
