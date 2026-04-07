import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { ExternalNodeEnrichment, UpsertExternalNodeEnrichmentInput } from '../../db/types';
import { IExternalNodeEnrichmentStore } from '../interfaces/IExternalNodeEnrichmentStore';

export class ExternalNodeEnrichmentStore implements IExternalNodeEnrichmentStore {
  constructor(private db: Database) {}

  findByCanonicalName(name: string): ExternalNodeEnrichment | undefined {
    return this.db
      .prepare('SELECT * FROM external_node_enrichment WHERE canonical_name = ?')
      .get(name) as ExternalNodeEnrichment | undefined;
  }

  findAll(): ExternalNodeEnrichment[] {
    return this.db
      .prepare('SELECT * FROM external_node_enrichment ORDER BY canonical_name')
      .all() as ExternalNodeEnrichment[];
  }

  upsert(input: UpsertExternalNodeEnrichmentInput): ExternalNodeEnrichment {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO external_node_enrichment (
          id, canonical_name, display_name, description, impact, contact, service_type, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_name) DO UPDATE SET
          display_name = excluded.display_name,
          description = excluded.description,
          impact = excluded.impact,
          contact = excluded.contact,
          service_type = excluded.service_type,
          updated_at = datetime('now'),
          updated_by = excluded.updated_by
      `)
      .run(
        id,
        input.canonical_name,
        input.display_name ?? null,
        input.description ?? null,
        input.impact ?? null,
        input.contact ?? null,
        input.service_type ?? null,
        input.updated_by ?? null
      );

    return this.findByCanonicalName(input.canonical_name)!;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM external_node_enrichment WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
