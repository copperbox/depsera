export interface ExternalDependencyTeam {
  id: string;
  name: string;
  key: string | null;
}

export interface ExternalDependencyEntry {
  canonical_name: string;
  description: string | null;
  teams: ExternalDependencyTeam[];
  aliases: string[];
  usage_count: number;
}
