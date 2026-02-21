/**
 * AlertRateLimiter enforces per-team hourly alert rate limits.
 *
 * Uses an in-memory Map keyed by teamId, tracking the count
 * and the start of the current hour window. The window resets
 * when a new hour is entered.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number; // timestamp in ms
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export class AlertRateLimiter {
  private teamCounts: Map<string, RateLimitEntry> = new Map();

  /**
   * Check if a team has exceeded its hourly alert limit.
   * @param teamId - Team to check.
   * @param maxPerHour - Maximum alerts allowed per hour.
   * @returns true if the rate limit has been exceeded (alert should be suppressed).
   */
  isLimited(teamId: string, maxPerHour: number): boolean {
    const entry = this.getOrCreateEntry(teamId);
    return entry.count >= maxPerHour;
  }

  /**
   * Record an alert dispatched for this team.
   * @param teamId - Team that received the alert.
   */
  recordAlert(teamId: string): void {
    const entry = this.getOrCreateEntry(teamId);
    entry.count++;
  }

  private getOrCreateEntry(teamId: string): RateLimitEntry {
    const now = Date.now();
    const entry = this.teamCounts.get(teamId);

    if (!entry || (now - entry.windowStart) >= ONE_HOUR_MS) {
      // Start a new window
      const newEntry: RateLimitEntry = { count: 0, windowStart: now };
      this.teamCounts.set(teamId, newEntry);
      return newEntry;
    }

    return entry;
  }

  /**
   * Clear all rate limit state.
   */
  clear(): void {
    this.teamCounts.clear();
  }

  /** Visible for testing */
  get size(): number {
    return this.teamCounts.size;
  }
}
