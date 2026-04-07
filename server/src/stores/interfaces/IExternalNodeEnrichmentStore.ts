import { ExternalNodeEnrichment, UpsertExternalNodeEnrichmentInput } from '../../db/types';

export interface IExternalNodeEnrichmentStore {
  findByCanonicalName(name: string): ExternalNodeEnrichment | undefined;
  findAll(): ExternalNodeEnrichment[];
  upsert(input: UpsertExternalNodeEnrichmentInput): ExternalNodeEnrichment;
  delete(id: string): boolean;
}
