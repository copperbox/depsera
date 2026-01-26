import { db } from '../db';
import { StoreRegistry } from './index';

/**
 * Execute a function within a database transaction.
 * All store operations within the callback share the same transaction context.
 *
 * @param fn - Function to execute within the transaction
 * @returns The return value of the function
 * @throws Re-throws any error from the function, rolling back the transaction
 *
 * @example
 * ```typescript
 * const result = withTransaction((stores) => {
 *   const team = stores.teams.create({ name: 'New Team' });
 *   const service = stores.services.create({
 *     name: 'New Service',
 *     team_id: team.id,
 *     health_endpoint: 'http://example.com/health'
 *   });
 *   return { team, service };
 * });
 * ```
 */
export function withTransaction<T>(fn: (stores: StoreRegistry) => T): T {
  return db.transaction(() => {
    const stores = StoreRegistry.create(db);
    return fn(stores);
  })();
}

/**
 * Execute an async-compatible function within a database transaction.
 * Note: SQLite transactions are synchronous, so async operations within
 * the transaction should be avoided. Use this for consistency with async APIs.
 *
 * @param fn - Function to execute within the transaction
 * @returns Promise resolving to the return value of the function
 */
export async function withTransactionAsync<T>(
  fn: (stores: StoreRegistry) => T | Promise<T>
): Promise<T> {
  return db.transaction(() => {
    const stores = StoreRegistry.create(db);
    return fn(stores);
  })();
}
