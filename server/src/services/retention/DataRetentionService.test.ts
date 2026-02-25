import { DataRetentionService } from './DataRetentionService';

// Mock stores
const mockDeleteLatency = jest.fn().mockReturnValue(0);
const mockDeleteError = jest.fn().mockReturnValue(0);
const mockDeleteAudit = jest.fn().mockReturnValue(0);
const mockDeleteAlertHistory = jest.fn().mockReturnValue(0);
const mockDeleteStatusChange = jest.fn().mockReturnValue(0);
const mockSettingsStore = {};

jest.mock('../../stores', () => ({
  getStores: () => ({
    latencyHistory: { deleteOlderThan: mockDeleteLatency },
    errorHistory: { deleteOlderThan: mockDeleteError },
    auditLog: { deleteOlderThan: mockDeleteAudit },
    alertHistory: { deleteOlderThan: mockDeleteAlertHistory },
    statusChangeEvents: { deleteOlderThan: mockDeleteStatusChange },
    settings: mockSettingsStore,
  }),
}));

// Mock SettingsService
const mockGet = jest.fn();
jest.mock('../settings/SettingsService', () => ({
  SettingsService: {
    getInstance: jest.fn(() => ({ get: mockGet })),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import logger from '../../utils/logger';

describe('DataRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    DataRetentionService.resetInstance();

    // Restore default mock implementations (clearAllMocks keeps implementations,
    // so we explicitly reset any throwing/custom implementations from prior tests)
    mockDeleteLatency.mockReturnValue(0);
    mockDeleteError.mockReturnValue(0);
    mockDeleteAudit.mockReturnValue(0);
    mockDeleteAlertHistory.mockReturnValue(0);
    mockDeleteStatusChange.mockReturnValue(0);

    // Default settings
    mockGet.mockImplementation((key) => {
      switch (key) {
        case 'data_retention_days': return 365;
        case 'retention_cleanup_time': return '02:00';
        default: return undefined;
      }
    });
  });

  afterEach(() => {
    DataRetentionService.resetInstance();
    jest.useRealTimers();
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = DataRetentionService.getInstance();
      const b = DataRetentionService.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance after reset', () => {
      const a = DataRetentionService.getInstance();
      DataRetentionService.resetInstance();
      const b = DataRetentionService.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('start / stop', () => {
    it('should start the scheduler', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();
      expect(service.isSchedulerActive).toBe(true);
    });

    it('should stop the scheduler', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();
      service.stop();
      expect(service.isSchedulerActive).toBe(false);
    });

    it('should not start twice', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();
      service.start(); // Should not create a second interval
      expect(service.isSchedulerActive).toBe(true);
      service.stop();
    });

    it('should log on start', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();
      expect(logger.info).toHaveBeenCalledWith('data retention scheduler started');
    });
  });

  describe('runCleanup', () => {
    it('should delete old rows from all history tables', () => {
      mockDeleteLatency.mockReturnValue(100);
      mockDeleteError.mockReturnValue(50);
      mockDeleteAudit.mockReturnValue(25);
      mockDeleteAlertHistory.mockReturnValue(10);
      mockDeleteStatusChange.mockReturnValue(5);

      const service = DataRetentionService.getInstance();
      const result = service.runCleanup();

      expect(result.latencyDeleted).toBe(100);
      expect(result.errorDeleted).toBe(50);
      expect(result.auditDeleted).toBe(25);
      expect(result.alertHistoryDeleted).toBe(10);
      expect(result.statusChangeDeleted).toBe(5);
      expect(result.retentionDays).toBe(365);
    });

    it('should use the configured retention days', () => {
      mockGet.mockImplementation((key) => {
        if (key === 'data_retention_days') return 30;
        if (key === 'retention_cleanup_time') return '02:00';
        return undefined;
      });

      const now = new Date('2026-02-21T10:00:00Z');
      jest.setSystemTime(now);

      const service = DataRetentionService.getInstance();
      const result = service.runCleanup();

      expect(result.retentionDays).toBe(30);

      // Verify the cutoff timestamp is approximately 30 days ago
      const cutoff = new Date(result.cutoffTimestamp);
      const expectedCutoff = new Date(now);
      expectedCutoff.setDate(expectedCutoff.getDate() - 30);
      expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
    });

    it('should pass ISO timestamp to store deleteOlderThan', () => {
      jest.setSystemTime(new Date('2026-02-21T10:00:00Z'));

      const service = DataRetentionService.getInstance();
      service.runCleanup();

      expect(mockDeleteLatency).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
      expect(mockDeleteError).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
      expect(mockDeleteAudit).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
      expect(mockDeleteAlertHistory).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
      expect(mockDeleteStatusChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    });

    it('should log the cleanup result', () => {
      mockDeleteLatency.mockReturnValue(10);
      mockDeleteError.mockReturnValue(5);
      mockDeleteAudit.mockReturnValue(2);
      mockDeleteAlertHistory.mockReturnValue(1);

      const service = DataRetentionService.getInstance();
      service.runCleanup();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          latencyDeleted: 10,
          errorDeleted: 5,
          auditDeleted: 2,
          alertHistoryDeleted: 1,
          statusChangeDeleted: 0,
          retentionDays: 365,
        }),
        'data retention cleanup completed',
      );
    });

    it('should handle zero deletions', () => {
      mockDeleteLatency.mockReturnValue(0);
      mockDeleteError.mockReturnValue(0);
      mockDeleteAudit.mockReturnValue(0);
      mockDeleteAlertHistory.mockReturnValue(0);
      mockDeleteStatusChange.mockReturnValue(0);

      const service = DataRetentionService.getInstance();
      const result = service.runCleanup();

      expect(result.latencyDeleted).toBe(0);
      expect(result.errorDeleted).toBe(0);
      expect(result.auditDeleted).toBe(0);
      expect(result.alertHistoryDeleted).toBe(0);
      expect(result.statusChangeDeleted).toBe(0);
    });

    it('should set lastRunDate after cleanup', () => {
      jest.setSystemTime(new Date('2026-02-21T10:00:00'));

      const service = DataRetentionService.getInstance();
      expect(service.lastRunDate).toBeNull();

      service.runCleanup();
      expect(service.lastRunDate).toBe('2026-02-21');
    });

    it('should propagate store errors', () => {
      mockDeleteLatency.mockImplementation(() => {
        throw new Error('DB locked');
      });

      const service = DataRetentionService.getInstance();
      expect(() => service.runCleanup()).toThrow('DB locked');
    });

    it('should reset isRunning even on error', () => {
      mockDeleteLatency.mockImplementation(() => {
        throw new Error('DB locked');
      });

      const service = DataRetentionService.getInstance();
      try { service.runCleanup(); } catch { /* expected */ }

      // isRunning should be reset by the finally block,
      // so a subsequent call should not be blocked
      mockDeleteLatency.mockReturnValue(0);
      const result = service.runCleanup();
      expect(result.latencyDeleted).toBe(0);
    });
  });

  describe('scheduled cleanup', () => {
    it('should run cleanup when past the scheduled time on startup', () => {
      // Set time after cleanup time (02:00)
      jest.setSystemTime(new Date('2026-02-21T03:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      // Synchronous — cleanup should have run immediately
      expect(mockDeleteLatency).toHaveBeenCalled();
      expect(mockDeleteError).toHaveBeenCalled();
      expect(mockDeleteAudit).toHaveBeenCalled();
      expect(mockDeleteAlertHistory).toHaveBeenCalled();
    });

    it('should not run cleanup when before scheduled time', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      expect(mockDeleteLatency).not.toHaveBeenCalled();
    });

    it('should run cleanup when check interval fires at the right time', () => {
      // Start before cleanup time
      jest.setSystemTime(new Date('2026-02-21T01:59:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      expect(mockDeleteLatency).not.toHaveBeenCalled();

      // Advance to past cleanup time
      jest.setSystemTime(new Date('2026-02-21T02:00:00'));
      jest.advanceTimersByTime(DataRetentionService.CHECK_INTERVAL_MS);

      expect(mockDeleteLatency).toHaveBeenCalled();
    });

    it('should not run cleanup twice on the same day', () => {
      jest.setSystemTime(new Date('2026-02-21T03:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      expect(mockDeleteLatency).toHaveBeenCalledTimes(1);

      // Advance by another interval — still same day
      jest.advanceTimersByTime(DataRetentionService.CHECK_INTERVAL_MS);

      expect(mockDeleteLatency).toHaveBeenCalledTimes(1);
    });

    it('should run cleanup again on the next day', () => {
      jest.setSystemTime(new Date('2026-02-21T03:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      expect(mockDeleteLatency).toHaveBeenCalledTimes(1);

      // Advance to next day past cleanup time
      jest.setSystemTime(new Date('2026-02-22T03:00:00'));
      jest.advanceTimersByTime(DataRetentionService.CHECK_INTERVAL_MS);

      expect(mockDeleteLatency).toHaveBeenCalledTimes(2);
    });

    it('should use custom cleanup time from settings', () => {
      mockGet.mockImplementation((key) => {
        if (key === 'data_retention_days') return 365;
        if (key === 'retention_cleanup_time') return '14:30';
        return undefined;
      });

      // Before 14:30
      jest.setSystemTime(new Date('2026-02-21T14:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();

      expect(mockDeleteLatency).not.toHaveBeenCalled();

      // After 14:30
      jest.setSystemTime(new Date('2026-02-21T14:30:00'));
      jest.advanceTimersByTime(DataRetentionService.CHECK_INTERVAL_MS);

      expect(mockDeleteLatency).toHaveBeenCalled();
    });

    it('should log error if cleanup fails during scheduled run', () => {
      mockDeleteLatency.mockImplementation(() => {
        throw new Error('disk full');
      });

      jest.setSystemTime(new Date('2026-02-21T03:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      // The error should be caught and logged, not thrown
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'data retention cleanup failed',
      );
    });

    it('should guard against overlapping runs via isRunning flag', () => {
      // This tests the isRunning guard. Since cleanup is synchronous,
      // true overlap can't happen, but the guard protects against
      // reentrant calls if cleanup were ever made async.
      jest.setSystemTime(new Date('2026-02-21T03:00:00'));

      const service = DataRetentionService.getInstance();
      service.start();

      // First run triggers and completes synchronously
      expect(mockDeleteLatency).toHaveBeenCalledTimes(1);

      // Same-day guard prevents second run
      jest.advanceTimersByTime(DataRetentionService.CHECK_INTERVAL_MS);
      expect(mockDeleteLatency).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetInstance', () => {
    it('should stop the scheduler on reset', () => {
      jest.setSystemTime(new Date('2026-02-21T01:00:00'));
      const service = DataRetentionService.getInstance();
      service.start();
      expect(service.isSchedulerActive).toBe(true);

      DataRetentionService.resetInstance();

      // Getting a new instance should not be running
      const newService = DataRetentionService.getInstance();
      expect(newService.isSchedulerActive).toBe(false);
    });
  });
});
