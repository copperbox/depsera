import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyAlias } from '../../db/types';
import { IDependencyAliasStore } from '../interfaces/IDependencyAliasStore';

export class DependencyAliasStore implements IDependencyAliasStore {
  constructor(private db: Database) {}

  findAll(): DependencyAlias[] {
    return this.db
      .prepare('SELECT * FROM dependency_aliases ORDER BY canonical_name ASC, alias ASC')
      .all() as DependencyAlias[];
  }

  findById(id: string): DependencyAlias | undefined {
    return this.db
      .prepare('SELECT * FROM dependency_aliases WHERE id = ?')
      .get(id) as DependencyAlias | undefined;
  }

  findByAlias(alias: string): DependencyAlias | undefined {
    return this.db
      .prepare('SELECT * FROM dependency_aliases WHERE alias = ?')
      .get(alias) as DependencyAlias | undefined;
  }

  getCanonicalNames(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT canonical_name FROM dependency_aliases ORDER BY canonical_name ASC')
      .all() as { canonical_name: string }[];
    return rows.map(r => r.canonical_name);
  }

  create(alias: string, canonicalName: string): DependencyAlias {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES (?, ?, ?)')
      .run(id, alias, canonicalName);
    return this.findById(id)!;
  }

  update(id: string, canonicalName: string): DependencyAlias | undefined {
    const result = this.db
      .prepare('UPDATE dependency_aliases SET canonical_name = ? WHERE id = ?')
      .run(canonicalName, id);
    if (result.changes === 0) return undefined;
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM dependency_aliases WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  resolveAlias(name: string): string | null {
    const row = this.db
      .prepare('SELECT canonical_name FROM dependency_aliases WHERE alias = ?')
      .get(name) as { canonical_name: string } | undefined;
    return row?.canonical_name ?? null;
  }
}
