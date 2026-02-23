export interface ExternalServiceTeam {
  id: string;
  name: string;
  description: string | null;
}

export interface ExternalService {
  id: string;
  name: string;
  description: string | null;
  team_id: string;
  team: ExternalServiceTeam;
  created_at: string;
  updated_at: string;
}

export interface CreateExternalServiceInput {
  name: string;
  team_id: string;
  description?: string;
}

export interface UpdateExternalServiceInput {
  name?: string;
  description?: string | null;
}
