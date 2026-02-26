import { handleResponse } from './common';

export interface PollHistoryEntry {
  error: string | null;
  recordedAt: string;
  isRecovery: boolean;
}

export interface PollHistoryResponse {
  serviceId: string;
  errorCount: number;
  entries: PollHistoryEntry[];
  pollWarnings: string[];
}

export async function fetchServicePollHistory(serviceId: string): Promise<PollHistoryResponse> {
  const response = await fetch(`/api/services/${serviceId}/poll-history`, { credentials: 'include' });
  return handleResponse<PollHistoryResponse>(response);
}
