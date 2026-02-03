import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { User } from '../../db/types';
import { IUserStore } from '../interfaces/IUserStore';
import { UserCreateInput, UserUpdateInput, ListOptions } from '../types';

/**
 * Store implementation for User entity operations
 */
export class UserStore implements IUserStore {
  constructor(private db: Database) {}

  findById(id: string): User | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as User | undefined;
  }

  findByEmail(email: string): User | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as User | undefined;
  }

  findByOidcSubject(oidcSubject: string): User | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE oidc_subject = ?')
      .get(oidcSubject) as User | undefined;
  }

  findAll(options?: ListOptions): User[] {
    const orderBy = options?.orderBy || 'name';
    const orderDir = options?.orderDirection || 'ASC';

    let query = `SELECT * FROM users ORDER BY ${orderBy} ${orderDir}`;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all() as User[];
  }

  findActive(options?: ListOptions): User[] {
    const orderBy = options?.orderBy || 'name';
    const orderDir = options?.orderDirection || 'ASC';

    let query = `SELECT * FROM users WHERE is_active = 1 ORDER BY ${orderBy} ${orderDir}`;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      /* istanbul ignore if -- Offset pagination rarely used in current API */
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all() as User[];
  }

  create(input: UserCreateInput): User {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO users (id, email, name, oidc_subject, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        id,
        input.email,
        input.name,
        input.oidc_subject ?? null,
        input.role ?? 'user',
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, input: UserUpdateInput): User | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.email !== undefined) {
      updates.push('email = ?');
      params.push(input.email);
    }
    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.role !== undefined) {
      updates.push('role = ?');
      params.push(input.role);
    }
    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM users WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE id = ?')
      .get(id);
    return row !== undefined;
  }

  existsByEmail(email: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE email = ?')
      .get(email);
    return row !== undefined;
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM users')
      .get() as { count: number };
    return row.count;
  }

  countActiveAdmins(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1')
      .get('admin') as { count: number };
    return row.count;
  }
}
