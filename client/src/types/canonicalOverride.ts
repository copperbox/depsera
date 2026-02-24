export interface CanonicalOverride {
  id: string;
  canonical_name: string;
  contact_override: string | null;
  impact_override: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CanonicalOverrideInput {
  contact_override?: Record<string, unknown> | null;
  impact_override?: string | null;
}
