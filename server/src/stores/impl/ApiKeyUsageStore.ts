import { Database } from 'better-sqlite3';
import { ApiKeyUsageBucket } from '../../db/types';
import { IApiKeyUsageStore, BulkUpsertEntry } from '../interfaces/IApiKeyUsageStore';

export class ApiKeyUsageStore implements IApiKeyUsageStore {
  constructor(private db: Database) {}

  bulkUpsert(entries: BulkUpsertEntry[]): void {
    if (entries.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO api_key_usage_buckets (api_key_id, bucket_start, granularity, push_count, rejected_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(api_key_id, bucket_start, granularity)
       DO UPDATE SET
         push_count = push_count + excluded.push_count,
         rejected_count = rejected_count + excluded.rejected_count`,
    );

    const runAll = this.db.transaction((rows: BulkUpsertEntry[]) => {
      for (const row of rows) {
        stmt.run(row.api_key_id, row.bucket_start, row.granularity, row.push_count, row.rejected_count);
      }
    });

    runAll(entries);
  }

  getBuckets(apiKeyId: string, granularity: 'minute' | 'hour', from: string, to: string): ApiKeyUsageBucket[] {
    return this.db
      .prepare(
        `SELECT * FROM api_key_usage_buckets
         WHERE api_key_id = ? AND granularity = ?
           AND bucket_start >= ? AND bucket_start <= ?
         ORDER BY bucket_start ASC`,
      )
      .all(apiKeyId, granularity, from, to) as ApiKeyUsageBucket[];
  }

  getBucketsByTeam(
    teamId: string,
    granularity: 'minute' | 'hour',
    from: string,
    to: string,
  ): (ApiKeyUsageBucket & { key_name: string; key_prefix: string })[] {
    return this.db
      .prepare(
        `SELECT b.*, k.name AS key_name, k.key_prefix
         FROM api_key_usage_buckets b
         JOIN team_api_keys k ON k.id = b.api_key_id
         WHERE k.team_id = ? AND b.granularity = ?
           AND b.bucket_start >= ? AND b.bucket_start <= ?
         ORDER BY b.bucket_start ASC`,
      )
      .all(teamId, granularity, from, to) as (ApiKeyUsageBucket & { key_name: string; key_prefix: string })[];
  }

  getAllBuckets(
    granularity: 'minute' | 'hour',
    from: string,
    to: string,
  ): (ApiKeyUsageBucket & { team_id: string; key_name: string })[] {
    return this.db
      .prepare(
        `SELECT b.*, k.team_id, k.name AS key_name
         FROM api_key_usage_buckets b
         JOIN team_api_keys k ON k.id = b.api_key_id
         WHERE b.granularity = ?
           AND b.bucket_start >= ? AND b.bucket_start <= ?
         ORDER BY b.bucket_start ASC`,
      )
      .all(granularity, from, to) as (ApiKeyUsageBucket & { team_id: string; key_name: string })[];
  }

  getSummaryForKeys(
    apiKeyIds: string[],
    from: string,
    to: string,
  ): Map<string, { push_count: number; rejected_count: number }> {
    const result = new Map<string, { push_count: number; rejected_count: number }>();
    if (apiKeyIds.length === 0) return result;

    const placeholders = apiKeyIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT api_key_id,
                SUM(push_count)     AS push_count,
                SUM(rejected_count) AS rejected_count
         FROM api_key_usage_buckets
         WHERE api_key_id IN (${placeholders})
           AND bucket_start >= ? AND bucket_start <= ?
         GROUP BY api_key_id`,
      )
      .all(...apiKeyIds, from, to) as { api_key_id: string; push_count: number; rejected_count: number }[];

    for (const row of rows) {
      result.set(row.api_key_id, { push_count: row.push_count, rejected_count: row.rejected_count });
    }

    return result;
  }

  pruneMinuteBuckets(olderThan: string): number {
    return this.db
      .prepare(`DELETE FROM api_key_usage_buckets WHERE granularity = 'minute' AND bucket_start < ?`)
      .run(olderThan).changes;
  }

  pruneHourBuckets(olderThan: string): number {
    return this.db
      .prepare(`DELETE FROM api_key_usage_buckets WHERE granularity = 'hour' AND bucket_start < ?`)
      .run(olderThan).changes;
  }

  pruneOrphanedBuckets(olderThan: string): number {
    return this.db
      .prepare(
        `DELETE FROM api_key_usage_buckets
         WHERE api_key_id NOT IN (SELECT id FROM team_api_keys)
           AND bucket_start < ?`,
      )
      .run(olderThan).changes;
  }
}
