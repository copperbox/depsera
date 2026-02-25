import { DependencyCanonicalOverride } from '../../db/types';

export interface CanonicalOverrideUpsertInput {
  canonical_name: string;
  contact_override?: string | null;
  impact_override?: string | null;
  updated_by: string;
}

export interface ICanonicalOverrideStore {
  findAll(): DependencyCanonicalOverride[];
  findByCanonicalName(canonicalName: string): DependencyCanonicalOverride | undefined;
  upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride;
  delete(canonicalName: string): boolean;
}
