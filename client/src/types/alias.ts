export interface DependencyAlias {
  id: string;
  alias: string;
  canonical_name: string;
  created_at: string;
}

export interface CreateAliasInput {
  alias: string;
  canonical_name: string;
}

export interface UpdateAliasInput {
  canonical_name: string;
}
