import type { Service } from './service';

export type AssociationType = 'api_call' | 'database' | 'message_queue' | 'cache' | 'other';

export const ASSOCIATION_TYPE_LABELS: Record<AssociationType, string> = {
  api_call: 'API Call',
  database: 'Database',
  message_queue: 'Message Queue',
  cache: 'Cache',
  other: 'Other',
};

export interface Association {
  id: string;
  dependency_id: string;
  linked_service_id: string;
  association_type: AssociationType;
  is_auto_suggested: number;
  confidence_score: number | null;
  is_dismissed: number;
  created_at: string;
  linked_service: Service;
}

export interface AssociationSuggestion {
  id: string;
  dependency_id: string;
  linked_service_id: string;
  association_type: AssociationType;
  is_auto_suggested: number;
  confidence_score: number | null;
  is_dismissed: number;
  created_at: string;
  dependency_name: string;
  service_name: string;
  linked_service_name: string;
}

export interface CreateAssociationInput {
  linked_service_id: string;
  association_type: AssociationType;
}
