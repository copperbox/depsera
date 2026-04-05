import { ApiKeyUsageBucket } from '../../db/types';

export interface BulkUpsertEntry {
  api_key_id: string;
  bucket_start: string;
  granularity: 'minute' | 'hour';
  push_count: number;
  rejected_count: number;
}

export interface IApiKeyUsageStore {
  bulkUpsert(entries: BulkUpsertEntry[]): void;
  getBuckets(apiKeyId: string, granularity: 'minute' | 'hour', from: string, to: string): ApiKeyUsageBucket[];
  getBucketsByTeam(teamId: string, granularity: 'minute' | 'hour', from: string, to: string): (ApiKeyUsageBucket & { key_name: string; key_prefix: string })[];
  getAllBuckets(granularity: 'minute' | 'hour', from: string, to: string): (ApiKeyUsageBucket & { team_id: string; key_name: string })[];
  getSummaryForKeys(apiKeyIds: string[], from: string, to: string): Map<string, { push_count: number; rejected_count: number }>;
  pruneMinuteBuckets(olderThan: string): number;
  pruneHourBuckets(olderThan: string): number;
  pruneOrphanedBuckets(olderThan: string): number;
}
