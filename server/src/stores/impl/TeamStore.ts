import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { Team, TeamMember, TeamMemberRole } from '../../db/types';
import { ITeamStore, TeamMemberWithUser, MembershipWithTeam } from '../interfaces/ITeamStore';
import { TeamCreateInput, TeamUpdateInput, TeamMemberListOptions } from '../types';

/**
 * Store implementation for Team entity operations
 */
export class TeamStore implements ITeamStore {
  constructor(private db: Database) {}

  findById(id: string): Team | undefined {
    return this.db
      .prepare('SELECT * FROM teams WHERE id = ?')
      .get(id) as Team | undefined;
  }

  findByName(name: string): Team | undefined {
    return this.db
      .prepare('SELECT * FROM teams WHERE name = ?')
      .get(name) as Team | undefined;
  }

  findAll(): Team[] {
    return this.db
      .prepare('SELECT * FROM teams ORDER BY name ASC')
      .all() as Team[];
  }

  create(input: TeamCreateInput): Team {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO teams (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(id, input.name, input.description ?? null, now, now);

    return this.findById(id)!;
  }

  update(id: string, input: TeamUpdateInput): Team | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db
      .prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM teams WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  findMembers(teamId: string, options?: TeamMemberListOptions): TeamMemberWithUser[] {
    let query = `
      SELECT
        tm.*,
        u.email as user_email,
        u.name as user_name
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
    `;

    const params: unknown[] = [teamId];

    if (options?.role) {
      query += ' AND tm.role = ?';
      params.push(options.role);
    }

    query += ' ORDER BY u.name ASC';

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all(...params) as TeamMemberWithUser[];
  }

  getMembership(teamId: string, userId: string): TeamMember | undefined {
    return this.db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(teamId, userId) as TeamMember | undefined;
  }

  getMembershipsByUserId(userId: string): MembershipWithTeam[] {
    return this.db
      .prepare(`
        SELECT
          tm.team_id,
          tm.role,
          t.name as team_name,
          t.description as team_description
        FROM team_members tm
        JOIN teams t ON tm.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY t.name ASC
      `)
      .all(userId) as MembershipWithTeam[];
  }

  addMember(teamId: string, userId: string, role: TeamMemberRole): TeamMember {
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO team_members (team_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(teamId, userId, role, now);

    return this.db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(teamId, userId) as TeamMember;
  }

  removeMember(teamId: string, userId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
      .run(teamId, userId);
    return result.changes > 0;
  }

  removeAllMembershipsForUser(userId: string): number {
    const result = this.db
      .prepare('DELETE FROM team_members WHERE user_id = ?')
      .run(userId);
    return result.changes;
  }

  updateMemberRole(teamId: string, userId: string, role: TeamMemberRole): boolean {
    const result = this.db
      .prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?')
      .run(role, teamId, userId);
    return result.changes > 0;
  }

  isMember(teamId: string, userId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(teamId, userId);
    return row !== undefined;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM teams WHERE id = ?')
      .get(id);
    return row !== undefined;
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM teams')
      .get() as { count: number };
    return row.count;
  }

  getMemberCount(teamId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM team_members WHERE team_id = ?')
      .get(teamId) as { count: number };
    return row.count;
  }

  getServiceCount(teamId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM services WHERE team_id = ?')
      .get(teamId) as { count: number };
    return row.count;
  }
}
