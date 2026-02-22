/**
 * FlapProtector tracks recent alerts per dependency to suppress
 * repeated alerts within a configurable cooldown window.
 *
 * Uses an in-memory Map keyed by dependencyId (or serviceId for
 * service-level events). Each entry records the timestamp of
 * the last dispatched alert.
 */
export class FlapProtector {
  /** Map of dependency/service key -> last alert timestamp (ms) */
  private lastAlertTimes: Map<string, number> = new Map();

  /**
   * Check if an alert should be suppressed due to flap protection.
   * @param key - Unique key (dependencyId or serviceId) to check.
   * @param cooldownMs - Cooldown window in milliseconds.
   * @returns true if the alert should be suppressed.
   */
  isSuppressed(key: string, cooldownMs: number): boolean {
    if (cooldownMs <= 0) return false;

    const lastTime = this.lastAlertTimes.get(key);
    if (lastTime === undefined) return false;

    return (Date.now() - lastTime) < cooldownMs;
  }

  /**
   * Record that an alert was dispatched for this key.
   * @param key - Unique key (dependencyId or serviceId).
   */
  recordAlert(key: string): void {
    this.lastAlertTimes.set(key, Date.now());
  }

  /**
   * Clear all tracked cooldowns.
   */
  clear(): void {
    this.lastAlertTimes.clear();
  }

  /** Visible for testing */
  get size(): number {
    return this.lastAlertTimes.size;
  }
}
