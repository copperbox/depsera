/**
 * Simple in-memory TTL cache for poll scheduling.
 * Tracks when each service was last polled and whether its TTL has expired.
 */
export class PollCache {
  private entries: Map<string, { expiresAt: number }> = new Map();

  /**
   * Returns true if the service should be polled (cache miss / TTL expired).
   */
  shouldPoll(serviceId: string): boolean {
    const entry = this.entries.get(serviceId);
    if (!entry) return true;
    return Date.now() >= entry.expiresAt;
  }

  /**
   * Mark a service as polled with a given TTL.
   */
  markPolled(serviceId: string, ttlMs: number): void {
    this.entries.set(serviceId, { expiresAt: Date.now() + ttlMs });
  }

  /**
   * Invalidate a service's cache entry, forcing re-poll on next tick.
   */
  invalidate(serviceId: string): void {
    this.entries.delete(serviceId);
  }

  /**
   * Remove a service from the cache entirely.
   */
  remove(serviceId: string): void {
    this.entries.delete(serviceId);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }
}
