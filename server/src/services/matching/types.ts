import { AssociationType } from '../../db/types';

export interface MatchSuggestion {
  dependencyId: string;
  dependencyName: string;
  serviceId: string;
  serviceName: string;
  associationType: AssociationType;
  confidenceScore: number;
  matchReason: string;
}

export interface MatchResult {
  serviceId: string;
  serviceName: string;
  associationType: AssociationType;
  confidenceScore: number;
  matchReason: string;
}
