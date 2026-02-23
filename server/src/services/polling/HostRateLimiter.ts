const DEFAULT_MAX_CONCURRENT_PER_HOST = 5;

export class HostRateLimiter {
  private activeCounts: Map<string, number> = new Map();
  private maxConcurrentPerHost: number;

  constructor(maxConcurrentPerHost?: number) {
    this.maxConcurrentPerHost = maxConcurrentPerHost
      ?? parseInt(process.env.POLL_MAX_CONCURRENT_PER_HOST || String(DEFAULT_MAX_CONCURRENT_PER_HOST), 10);
  }

  /**
   * Try to acquire a poll slot for the given hostname.
   * Returns true if acquired, false if at capacity.
   */
  acquire(hostname: string): boolean {
    const current = this.activeCounts.get(hostname) || 0;
    if (current >= this.maxConcurrentPerHost) {
      return false;
    }
    this.activeCounts.set(hostname, current + 1);
    return true;
  }

  /**
   * Release a poll slot for the given hostname.
   */
  release(hostname: string): void {
    const current = this.activeCounts.get(hostname) || 0;
    if (current <= 1) {
      this.activeCounts.delete(hostname);
    } else {
      this.activeCounts.set(hostname, current - 1);
    }
  }

  /**
   * Extract hostname from a URL string.
   */
  static getHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get current active count for a hostname.
   */
  getActiveCount(hostname: string): number {
    return this.activeCounts.get(hostname) || 0;
  }

  /**
   * Clear all tracked state.
   */
  clear(): void {
    this.activeCounts.clear();
  }
}
