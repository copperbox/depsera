import { PollResult } from './types';

/**
 * Promise coalescing for concurrent polls to the same endpoint URL.
 *
 * When multiple services share the same health endpoint, only the first
 * caller executes the poll function. Subsequent callers for the same URL
 * within the same poll cycle receive the same promise/result.
 *
 * Cleanup happens via .finally() — no stale caching across poll cycles.
 */
export class PollDeduplicator {
  private inflight: Map<string, Promise<PollResult>> = new Map();

  /**
   * Deduplicate a poll by URL. If a poll for this URL is already in-flight,
   * return the existing promise. Otherwise, execute pollFn and share its result.
   */
  deduplicate(url: string, pollFn: () => Promise<PollResult>): Promise<PollResult> {
    const existing = this.inflight.get(url);
    if (existing) {
      return existing;
    }

    const promise = pollFn().finally(() => {
      this.inflight.delete(url);
    });

    this.inflight.set(url, promise);
    return promise;
  }

  /**
   * Check if a poll for the given URL is currently in-flight.
   */
  isInflight(url: string): boolean {
    return this.inflight.has(url);
  }

  /**
   * Get the number of in-flight polls.
   */
  get size(): number {
    return this.inflight.size;
  }

  /**
   * Clear all in-flight tracking. Does not cancel pending promises.
   */
  clear(): void {
    this.inflight.clear();
  }
}
