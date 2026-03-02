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
  created_at: string;
  linked_service: Service;
}

export interface CreateAssociationInput {
  linked_service_id: string;
  association_type: AssociationType;
}
