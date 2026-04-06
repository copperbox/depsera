import { getStores } from '../../stores';
import { SettingsService } from '../settings/SettingsService';
import logger from '../../utils/logger';

/**
 * DataRetentionService runs scheduled cleanup of old history data.
 *
 * Deletes rows from dependency_latency_history, dependency_error_history,
 * and audit_log older than the configured retention period.
 *
 * Scheduling: checks once per minute whether the configured cleanup time
 * has been reached. Runs cleanup at most once per day.
 */
export class DataRetentionService {
  private static instance: DataRetentionService | null = null;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastCleanupDate: string | null = null;
  private isRunning = false;

  /** Visible for testing */
  static readonly CHECK_INTERVAL_MS = 60_000; // Check every minute

  private constructor() {}

  static getInstance(): DataRetentionService {
    if (!DataRetentionService.instance) {
      DataRetentionService.instance = new DataRetentionService();
    }
    return DataRetentionService.instance;
  }

  static resetInstance(): void {
    if (DataRetentionService.instance) {
      DataRetentionService.instance.stop();
      DataRetentionService.instance = null;
    }
  }

  /**
   * Start the retention scheduler. Runs an initial overdue check,
   * then checks every minute if it's time to run cleanup.
   */
  start(): void {
    if (this.intervalHandle) {
      return; // Already running
    }

    logger.info('data retention scheduler started');

    // Run overdue check on startup
    this.checkAndRun();

    // Check every minute
    this.intervalHandle = setInterval(() => {
      this.checkAndRun();
    }, DataRetentionService.CHECK_INTERVAL_MS);
    this.intervalHandle.unref();
  }

  /**
   * Stop the retention scheduler.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Check if the cleanup time has been reached today, and run cleanup if so.
   */
  private checkAndRun(): void {
    const now = new Date();
    const todayDate = formatLocalDate(now);

    // Already ran today
    if (this.lastCleanupDate === todayDate) {
      return;
    }

    // Already running (guard against overlapping runs)
    if (this.isRunning) {
      return;
    }

    const settings = this.getSettings();
    const cleanupTime = settings.get('retention_cleanup_time');
    const [targetHour, targetMinute] = cleanupTime.split(':').map(Number);

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if we've passed the cleanup time for today
    if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
      try {
        this.runCleanup();
      } catch (error) {
        logger.error({ err: error }, 'data retention cleanup failed');
      }
    }
  }

  /**
   * Execute the retention cleanup. Deletes old rows from history tables.
   * All store operations are synchronous (better-sqlite3).
   */
  runCleanup(): CleanupResult {
    this.isRunning = true;

    try {
      const settings = this.getSettings();
      const retentionDays = settings.get('data_retention_days');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = cutoffDate.toISOString();

      const stores = getStores();

      const latencyDeleted = stores.latencyHistory.deleteOlderThan(cutoffTimestamp);
      const errorDeleted = stores.errorHistory.deleteOlderThan(cutoffTimestamp);
      const auditDeleted = stores.auditLog.deleteOlderThan(cutoffTimestamp);
      const alertHistoryDeleted = stores.alertHistory.deleteOlderThan(cutoffTimestamp);
      const statusChangeDeleted = stores.statusChangeEvents.deleteOlderThan(cutoffTimestamp);
      const pollHistoryDeleted = stores.servicePollHistory.deleteOlderThan(cutoffTimestamp);

      // Manifest-related cleanup uses a fixed 90-day retention period
      const manifestCutoff = new Date();
      manifestCutoff.setDate(manifestCutoff.getDate() - 90);
      const manifestCutoffTimestamp = manifestCutoff.toISOString();

      const syncHistoryDeleted = stores.manifestSyncHistory.deleteOlderThan(manifestCutoffTimestamp);
      // Only delete terminal drift flags (accepted, resolved); pending and dismissed are preserved
      const driftFlagsDeleted = stores.driftFlags.deleteOlderThan(manifestCutoffTimestamp, ['accepted', 'resolved']);

      // Clean up expired alert mutes (not retention-based — they self-expire)
      const mutesExpired = stores.alertMutes.deleteExpired();

      // Span retention: uses configurable span_retention_days from app_settings (default 7)
      const spanRetentionDaysStr = stores.appSettings.get('span_retention_days');
      const spanRetentionDays = spanRetentionDaysStr ? parseInt(spanRetentionDaysStr, 10) : 7;
      const spanCutoff = new Date();
      spanCutoff.setDate(spanCutoff.getDate() - spanRetentionDays);
      const spanCutoffTimestamp = spanCutoff.toISOString();

      const spansDeleted = stores.spans.deleteOlderThan(spanCutoffTimestamp);

      // Dismissed auto-suggestion cleanup: uses same span retention window
      const dismissedAssociationsDeleted = stores.associations.deleteOldDismissed(spanCutoffTimestamp);

      // Usage bucket retention: minute=24h, hour=30d, orphaned=7d
      const usageMinuteDeleted = stores.apiKeyUsage.pruneMinuteBuckets(
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      );
      const usageHourDeleted = stores.apiKeyUsage.pruneHourBuckets(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      );
      const usageOrphanedDeleted = stores.apiKeyUsage.pruneOrphanedBuckets(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      );

      const result: CleanupResult = {
        latencyDeleted,
        errorDeleted,
        auditDeleted,
        alertHistoryDeleted,
        statusChangeDeleted,
        pollHistoryDeleted,
        syncHistoryDeleted,
        driftFlagsDeleted,
        mutesExpired,
        usageMinuteDeleted,
        usageHourDeleted,
        usageOrphanedDeleted,
        spansDeleted,
        dismissedAssociationsDeleted,
        retentionDays,
        cutoffTimestamp,
      };

      logger.info(result, 'data retention cleanup completed');

      this.lastCleanupDate = formatLocalDate(new Date());

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the SettingsService instance. Extracted for testability.
   */
  private getSettings(): SettingsService {
    return SettingsService.getInstance(getStores().settings);
  }

  /** Visible for testing: whether the scheduler interval is active */
  get isSchedulerActive(): boolean {
    return this.intervalHandle !== null;
  }

  /** Visible for testing: the date of the last cleanup run */
  get lastRunDate(): string | null {
    return this.lastCleanupDate;
  }
}

/**
 * Format a Date as YYYY-MM-DD using local time (not UTC).
 * Using local time ensures consistency with getHours()/getMinutes().
 */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CleanupResult {
  latencyDeleted: number;
  errorDeleted: number;
  auditDeleted: number;
  alertHistoryDeleted: number;
  statusChangeDeleted: number;
  pollHistoryDeleted: number;
  syncHistoryDeleted: number;
  driftFlagsDeleted: number;
  mutesExpired: number;
  usageMinuteDeleted: number;
  usageHourDeleted: number;
  usageOrphanedDeleted: number;
  spansDeleted: number;
  dismissedAssociationsDeleted: number;
  retentionDays: number;
  cutoffTimestamp: string;
}
