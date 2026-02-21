import { AlertHistoryEntry } from '../../db/types';

export interface AlertHistoryListOptions {
  limit?: number;
  offset?: number;
  channelId?: string;
  serviceId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface IAlertHistoryStore {
  create(entry: Omit<AlertHistoryEntry, 'id'>): AlertHistoryEntry;
  findByChannelId(channelId: string, options?: AlertHistoryListOptions): AlertHistoryEntry[];
  findByTeamId(teamId: string, options?: AlertHistoryListOptions): AlertHistoryEntry[];
  count(options?: AlertHistoryListOptions): number;
  deleteOlderThan(timestamp: string): number;
}
