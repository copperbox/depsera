import { EventEmitter } from 'events';
import { AlertService } from './AlertService';
import { IAlertSender, AlertEvent, SendResult } from './types';
import { PollingEventType, StatusChangeEvent } from '../polling/types';
import { AlertChannel, AlertRule, Service } from '../../db/types';
import type { StoreRegistry } from '../../stores';
import type { SettingsService } from '../settings/SettingsService';

// Mock logger to suppress output during tests
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock getStores so getInstance() doesn't hit the real database
jest.mock('../../stores', () => ({
  getStores: jest.fn(() => ({
    services: { findById: jest.fn() },
    alertRules: { findActiveByTeamId: jest.fn().mockReturnValue([]) },
    alertChannels: { findActiveByTeamId: jest.fn().mockReturnValue([]) },
    alertHistory: { create: jest.fn() },
    dependencies: { findByServiceId: jest.fn().mockReturnValue([]), findById: jest.fn() },
    alertMutes: { isEffectivelyMuted: jest.fn().mockReturnValue(false), isServiceMuted: jest.fn().mockReturnValue(false) },
    settings: {},
  })),
}));

// Mock SettingsService so getInstance() doesn't query the database
jest.mock('../settings/SettingsService', () => ({
  SettingsService: {
    getInstance: jest.fn(() => ({
      get: jest.fn(),
    })),
  },
}));

// ---- Mock stores ----
const mockService: Service = {
  id: 'svc-1',
  name: 'Test Service',
  team_id: 'team-1',
  health_endpoint: 'https://example.com/health',
  metrics_endpoint: null,
  schema_config: null,
  poll_interval_ms: 30000,
  is_active: 1,
  is_external: 0,
  description: null,
  last_poll_success: 1,
  last_poll_error: null,
  poll_warnings: null,
  manifest_key: null,
  manifest_managed: 0,
  manifest_config_id: null,
  manifest_last_synced_values: null,
  health_endpoint_format: 'default',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockChannel: AlertChannel = {
  id: 'ch-1',
  team_id: 'team-1',
  channel_type: 'slack',
  config: '{"webhookUrl":"https://hooks.slack.com/test"}',
  is_active: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockRule: AlertRule = {
  id: 'rule-1',
  team_id: 'team-1',
  severity_filter: 'all',
  is_active: 1,
  use_custom_thresholds: 0,
  cooldown_minutes: null,
  rate_limit_per_hour: null,
  alert_delay_minutes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createMockStores() {
  return {
    services: {
      findById: jest.fn().mockReturnValue(mockService),
    },
    alertRules: {
      findActiveByTeamId: jest.fn().mockReturnValue([mockRule]),
    },
    alertChannels: {
      findActiveByTeamId: jest.fn().mockReturnValue([mockChannel]),
    },
    alertHistory: {
      create: jest.fn().mockReturnValue({ id: 'hist-1' }),
    },
    dependencies: {
      findByServiceId: jest.fn().mockReturnValue([
        { id: 'dep-1', name: 'postgres-main', service_id: 'svc-1', canonical_name: null },
      ]),
      findById: jest.fn().mockReturnValue({ id: 'dep-1', name: 'postgres-main', service_id: 'svc-1', canonical_name: null }),
    },
    alertMutes: {
      isEffectivelyMuted: jest.fn().mockReturnValue(false),
      isServiceMuted: jest.fn().mockReturnValue(false),
    },
    settings: {},
  };
}

function createMockSettings() {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      switch (key) {
        case 'alert_cooldown_minutes': return 5;
        case 'alert_rate_limit_per_hour': return 30;
        default: return undefined;
      }
    }),
  };
}

function createMockSender(result: SendResult = { success: true }): IAlertSender {
  return {
    send: jest.fn().mockResolvedValue(result),
  };
}

describe('AlertService', () => {
  let service: AlertService;
  let pollingEmitter: EventEmitter;
  let mockStores: ReturnType<typeof createMockStores>;
  let mockSettings: ReturnType<typeof createMockSettings>;
  let mockSender: IAlertSender;

  beforeEach(() => {
    jest.useFakeTimers();
    AlertService.resetInstance();
    pollingEmitter = new EventEmitter();
    mockStores = createMockStores();
    mockSettings = createMockSettings();
    mockSender = createMockSender();

    service = new AlertService(
      mockStores as unknown as StoreRegistry,
      mockSettings as unknown as SettingsService,
    );
    service.registerSender('slack', mockSender);
    service.start(pollingEmitter);
  });

  afterEach(() => {
    service.shutdown();
    jest.useRealTimers();
  });

  // ---- Singleton ----

  describe('singleton', () => {
    it('should return same instance from getInstance', () => {
      AlertService.resetInstance();
      const a = AlertService.getInstance();
      const b = AlertService.getInstance();
      expect(a).toBe(b);
      a.shutdown();
      AlertService.resetInstance();
    });

    it('should return new instance after resetInstance', () => {
      AlertService.resetInstance();
      const a = AlertService.getInstance();
      AlertService.resetInstance();
      const b = AlertService.getInstance();
      expect(a).not.toBe(b);
      b.shutdown();
      AlertService.resetInstance();
    });
  });

  // ---- Event handling ----

  describe('status change handling', () => {
    it('should dispatch alert on status change event', async () => {
      const event: StatusChangeEvent = {
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyName: 'postgres-main',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      };

      pollingEmitter.emit(PollingEventType.STATUS_CHANGE, event);

      // Wait for async processing
      await jest.runAllTimersAsync();

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      const sentEvent: AlertEvent = (mockSender.send as jest.Mock).mock.calls[0][0];
      expect(sentEvent.eventType).toBe('status_change');
      expect(sentEvent.serviceId).toBe('svc-1');
      expect(sentEvent.dependencyName).toBe('postgres-main');
      expect(sentEvent.severity).toBe('critical'); // went unhealthy
    });

    it('should set severity to warning for recovery events', async () => {
      const event: StatusChangeEvent = {
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyName: 'postgres-main',
        previousHealthy: false,
        currentHealthy: true,
        timestamp: '2026-01-01T00:00:00Z',
      };

      pollingEmitter.emit(PollingEventType.STATUS_CHANGE, event);
      await jest.runAllTimersAsync();

      const sentEvent: AlertEvent = (mockSender.send as jest.Mock).mock.calls[0][0];
      expect(sentEvent.severity).toBe('warning');
    });

    it('should resolve dependency ID from store', async () => {
      const event: StatusChangeEvent = {
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyName: 'postgres-main',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      };

      pollingEmitter.emit(PollingEventType.STATUS_CHANGE, event);
      await jest.runAllTimersAsync();

      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ dependency_id: 'dep-1' }),
      );
    });
  });

  describe('poll error handling', () => {
    it('should dispatch alert on poll error event', async () => {
      pollingEmitter.emit(PollingEventType.POLL_ERROR, {
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        error: 'Connection refused',
      });

      await jest.runAllTimersAsync();

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      const sentEvent: AlertEvent = (mockSender.send as jest.Mock).mock.calls[0][0];
      expect(sentEvent.eventType).toBe('poll_error');
      expect(sentEvent.severity).toBe('critical');
      expect(sentEvent.error).toBe('Connection refused');
    });
  });

  // ---- processEvent ----

  describe('processEvent', () => {
    const baseEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'svc-1',
      serviceName: 'Test Service',
      dependencyId: 'dep-1',
      dependencyName: 'postgres-main',
      severity: 'critical',
      previousHealthy: true,
      currentHealthy: false,
      timestamp: '2026-01-01T00:00:00Z',
    };

    it('should skip when service not found', async () => {
      mockStores.services.findById.mockReturnValue(undefined);
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should skip when no active rules', async () => {
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([]);
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should skip when no active channels', async () => {
      mockStores.alertChannels.findActiveByTeamId.mockReturnValue([]);
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should dispatch to all active channels', async () => {
      const secondChannel: AlertChannel = {
        ...mockChannel,
        id: 'ch-2',
        channel_type: 'slack',
      };
      mockStores.alertChannels.findActiveByTeamId.mockReturnValue([mockChannel, secondChannel]);

      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should record sent history for successful dispatch', async () => {
      await service.processEvent(baseEvent);
      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'sent' }),
      );
    });

    it('should record failed history and schedule retry on dispatch failure', async () => {
      const failingSender = createMockSender({ success: false, error: 'Network error' });
      service.registerSender('slack', failingSender);

      await service.processEvent(baseEvent);

      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(service.pendingRetryCount).toBe(1);
    });

    it('should record failed history and schedule retry on sender exception', async () => {
      const throwingSender: IAlertSender = {
        send: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      service.registerSender('slack', throwingSender);

      await service.processEvent(baseEvent);

      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(service.pendingRetryCount).toBe(1);
    });

    it('should warn and record failed when no sender registered for channel type', async () => {
      const webhookChannel: AlertChannel = {
        ...mockChannel,
        id: 'ch-webhook',
        channel_type: 'webhook',
      };
      mockStores.alertChannels.findActiveByTeamId.mockReturnValue([webhookChannel]);

      await service.processEvent(baseEvent);

      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  // ---- Severity filtering ----

  describe('severity filtering', () => {
    const criticalEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'svc-1',
      serviceName: 'Test Service',
      severity: 'critical',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const warningEvent: AlertEvent = {
      ...criticalEvent,
      severity: 'warning',
    };

    it('should dispatch critical events when rule is "critical"', async () => {
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, severity_filter: 'critical' },
      ]);
      await service.processEvent(criticalEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should not dispatch warning events when rule is "critical"', async () => {
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, severity_filter: 'critical' },
      ]);
      await service.processEvent(warningEvent);
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should dispatch both critical and warning when rule is "warning"', async () => {
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, severity_filter: 'warning' },
      ]);

      await service.processEvent({ ...criticalEvent, dependencyId: 'dep-a' });
      await service.processEvent({ ...warningEvent, dependencyId: 'dep-b' });
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should dispatch all events when rule is "all"', async () => {
      await service.processEvent({ ...criticalEvent, dependencyId: 'dep-a' });
      await service.processEvent({ ...warningEvent, dependencyId: 'dep-b' });
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Flap protection ----

  describe('flap protection', () => {
    const baseEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'svc-1',
      serviceName: 'Test Service',
      dependencyId: 'dep-1',
      severity: 'critical',
      timestamp: '2026-01-01T00:00:00Z',
    };

    it('should suppress repeated alerts within cooldown', async () => {
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);

      // Second event within cooldown
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1); // still 1
    });

    it('should record suppressed history when flap-protected', async () => {
      await service.processEvent(baseEvent);
      await service.processEvent(baseEvent);

      const calls = mockStores.alertHistory.create.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].status).toBe('sent');
      expect(calls[1][0].status).toBe('suppressed');
    });

    it('should allow alert after cooldown expires', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);

      // Advance past 5 min cooldown
      jest.setSystemTime(new Date('2026-01-01T00:05:01Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should use serviceId as flap key when no dependencyId', async () => {
      const serviceEvent: AlertEvent = {
        ...baseEvent,
        dependencyId: undefined,
      };

      await service.processEvent(serviceEvent);
      await service.processEvent(serviceEvent);

      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should not suppress recovery events within cooldown', async () => {
      const unhealthyEvent: AlertEvent = {
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'critical',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      };

      const recoveryEvent: AlertEvent = {
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
        timestamp: '2026-01-01T00:01:00Z',
      };

      // Unhealthy alert goes out, starts cooldown
      await service.processEvent(unhealthyEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);

      // Recovery within cooldown should still be sent
      await service.processEvent(recoveryEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should still suppress non-recovery events within cooldown after recovery', async () => {
      const unhealthyEvent: AlertEvent = {
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'critical',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      };

      const recoveryEvent: AlertEvent = {
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
        timestamp: '2026-01-01T00:01:00Z',
      };

      // Unhealthy → Recovery (both sent)
      await service.processEvent(unhealthyEvent);
      await service.processEvent(recoveryEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);

      // Another unhealthy within cooldown of the recovery → suppressed
      await service.processEvent({ ...unhealthyEvent, timestamp: '2026-01-01T00:02:00Z' });
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should not suppress when cooldown is 0', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0;
        if (key === 'alert_rate_limit_per_hour') return 30;
        return undefined;
      });

      await service.processEvent(baseEvent);
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should use per-team cooldown when use_custom_thresholds is enabled', async () => {
      // Set global cooldown to 5 min, but per-team to 0 (disabled)
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 5;
        if (key === 'alert_rate_limit_per_hour') return 30;
        return undefined;
      });

      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 1, cooldown_minutes: 0 },
      ]);

      await service.processEvent(baseEvent);
      await service.processEvent(baseEvent);
      // With cooldown 0, both should go through
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should fall back to global cooldown when use_custom_thresholds is disabled', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 5;
        if (key === 'alert_rate_limit_per_hour') return 30;
        return undefined;
      });

      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 0, cooldown_minutes: 0 },
      ]);

      await service.processEvent(baseEvent);
      await service.processEvent(baseEvent);
      // Global cooldown (5 min) should suppress the second
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should fall back to global cooldown when custom cooldown_minutes is null', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 5;
        if (key === 'alert_rate_limit_per_hour') return 30;
        return undefined;
      });

      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 1, cooldown_minutes: null },
      ]);

      await service.processEvent(baseEvent);
      await service.processEvent(baseEvent);
      // Should use global cooldown → suppressed
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Rate limiting ----

  describe('rate limiting', () => {
    it('should suppress after rate limit exceeded', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0; // disable flap protection
        if (key === 'alert_rate_limit_per_hour') return 3;
        return undefined;
      });

      for (let i = 0; i < 5; i++) {
        await service.processEvent({
          eventType: 'status_change',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          dependencyId: `dep-${i}`, // different deps to avoid flap protection
          severity: 'critical',
          timestamp: '2026-01-01T00:00:00Z',
        });
      }

      expect(mockSender.send).toHaveBeenCalledTimes(3);
    });

    it('should not suppress recovery events when rate limited', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0; // disable flap protection
        if (key === 'alert_rate_limit_per_hour') return 2;
        return undefined;
      });

      // Exhaust the rate limit with critical events
      for (let i = 0; i < 2; i++) {
        await service.processEvent({
          eventType: 'status_change',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          dependencyId: `dep-${i}`,
          severity: 'critical',
          previousHealthy: true,
          currentHealthy: false,
          timestamp: '2026-01-01T00:00:00Z',
        });
      }
      expect(mockSender.send).toHaveBeenCalledTimes(2);

      // Another critical event should be rate-limited
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-99',
        severity: 'critical',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(mockSender.send).toHaveBeenCalledTimes(2); // still 2 (suppressed)

      // Recovery event should bypass rate limit
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-0',
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(mockSender.send).toHaveBeenCalledTimes(3); // recovery gets through
    });

    it('should record suppressed history when rate-limited', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0;
        if (key === 'alert_rate_limit_per_hour') return 1;
        return undefined;
      });

      // First should send
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      // Second should be rate-limited
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-2',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      const calls = mockStores.alertHistory.create.mock.calls;
      const statuses = calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).status);
      expect(statuses).toContain('sent');
      expect(statuses).toContain('suppressed');
    });

    it('should use per-team rate limit when use_custom_thresholds is enabled', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0;
        if (key === 'alert_rate_limit_per_hour') return 1; // global: only 1
        return undefined;
      });

      // Per-team allows 5
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 1, rate_limit_per_hour: 5 },
      ]);

      for (let i = 0; i < 3; i++) {
        await service.processEvent({
          eventType: 'status_change',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          dependencyId: `dep-${i}`,
          severity: 'critical',
          timestamp: '2026-01-01T00:00:00Z',
        });
      }

      // All 3 should go through (per-team limit is 5)
      expect(mockSender.send).toHaveBeenCalledTimes(3);
    });

    it('should fall back to global rate limit when use_custom_thresholds is disabled', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0;
        if (key === 'alert_rate_limit_per_hour') return 2;
        return undefined;
      });

      // Even though per-team value is 100, it should be ignored
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 0, rate_limit_per_hour: 100 },
      ]);

      for (let i = 0; i < 4; i++) {
        await service.processEvent({
          eventType: 'status_change',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          dependencyId: `dep-${i}`,
          severity: 'critical',
          timestamp: '2026-01-01T00:00:00Z',
        });
      }

      // Global limit of 2 should apply
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should fall back to global rate limit when custom rate_limit_per_hour is null', async () => {
      mockSettings.get.mockImplementation((key: string) => {
        if (key === 'alert_cooldown_minutes') return 0;
        if (key === 'alert_rate_limit_per_hour') return 2;
        return undefined;
      });

      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, use_custom_thresholds: 1, rate_limit_per_hour: null },
      ]);

      for (let i = 0; i < 4; i++) {
        await service.processEvent({
          eventType: 'status_change',
          serviceId: 'svc-1',
          serviceName: 'Test Service',
          dependencyId: `dep-${i}`,
          severity: 'critical',
          timestamp: '2026-01-01T00:00:00Z',
        });
      }

      // Global limit of 2 should apply
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Retry ----

  describe('retry logic', () => {
    it('should retry failed dispatch after 30 seconds', async () => {
      const failingSender: IAlertSender = {
        send: jest.fn()
          .mockResolvedValueOnce({ success: false, error: 'Timeout' })
          .mockResolvedValueOnce({ success: true }),
      };
      service.registerSender('slack', failingSender);

      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(failingSender.send).toHaveBeenCalledTimes(1);
      expect(service.pendingRetryCount).toBe(1);

      // Advance 30 seconds
      await jest.advanceTimersByTimeAsync(30_000);

      expect(failingSender.send).toHaveBeenCalledTimes(2);
      expect(service.pendingRetryCount).toBe(0);
    });

    it('should record sent history on successful retry', async () => {
      const failingSender: IAlertSender = {
        send: jest.fn()
          .mockResolvedValueOnce({ success: false, error: 'Timeout' })
          .mockResolvedValueOnce({ success: true }),
      };
      service.registerSender('slack', failingSender);

      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      await jest.advanceTimersByTimeAsync(30_000);

      const calls = mockStores.alertHistory.create.mock.calls;
      const statuses = calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).status);
      expect(statuses).toContain('failed');
      expect(statuses).toContain('sent');
    });

    it('should handle retry failure gracefully', async () => {
      const failingSender: IAlertSender = {
        send: jest.fn().mockResolvedValue({ success: false, error: 'Permanent error' }),
      };
      service.registerSender('slack', failingSender);

      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      // Should not throw
      await jest.advanceTimersByTimeAsync(30_000);

      expect(failingSender.send).toHaveBeenCalledTimes(2);
    });

    it('should handle retry exception gracefully', async () => {
      const throwingSender: IAlertSender = {
        send: jest.fn().mockRejectedValue(new Error('Crash')),
      };
      service.registerSender('slack', throwingSender);

      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      // Should not throw
      await jest.advanceTimersByTimeAsync(30_000);

      expect(throwingSender.send).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Shutdown ----

  describe('shutdown', () => {
    it('should remove event listeners', () => {
      service.shutdown();

      pollingEmitter.emit(PollingEventType.STATUS_CHANGE, {
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyName: 'postgres-main',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should clear pending retries', async () => {
      const failingSender: IAlertSender = {
        send: jest.fn().mockResolvedValue({ success: false, error: 'Fail' }),
      };
      service.registerSender('slack', failingSender);

      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(service.pendingRetryCount).toBe(1);

      service.shutdown();
      expect(service.pendingRetryCount).toBe(0);
    });

    it('should clear flap protector and rate limiter', async () => {
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(service.getFlapProtector().size).toBeGreaterThan(0);
      expect(service.getRateLimiter().size).toBeGreaterThan(0);

      service.shutdown();

      expect(service.getFlapProtector().size).toBe(0);
      expect(service.getRateLimiter().size).toBe(0);
    });
  });

  // ---- Test alert ----

  describe('sendTestAlert', () => {
    it('should send test alert to registered sender', async () => {
      const result = await service.sendTestAlert('slack', '{"webhookUrl":"https://test"}');
      expect(result.success).toBe(true);
      expect(mockSender.send).toHaveBeenCalledTimes(1);

      const sentEvent: AlertEvent = (mockSender.send as jest.Mock).mock.calls[0][0];
      expect(sentEvent.serviceId).toBe('test');
      expect(sentEvent.serviceName).toBe('Test Service');
    });

    it('should return error when no sender registered', async () => {
      const result = await service.sendTestAlert('webhook', '{}');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No sender registered');
    });
  });

  // ---- Mute check ----

  describe('mute check', () => {
    const baseEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'svc-1',
      serviceName: 'Test Service',
      dependencyId: 'dep-1',
      dependencyName: 'postgres-main',
      severity: 'critical',
      previousHealthy: true,
      currentHealthy: false,
      timestamp: '2026-01-01T00:00:00Z',
    };

    it('should suppress alert when dependency is muted', async () => {
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(true);

      await service.processEvent(baseEvent);

      expect(mockSender.send).not.toHaveBeenCalled();
      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'muted' }),
      );
    });

    it('should record muted history for each channel', async () => {
      const secondChannel: AlertChannel = { ...mockChannel, id: 'ch-2' };
      mockStores.alertChannels.findActiveByTeamId.mockReturnValue([mockChannel, secondChannel]);
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(true);

      await service.processEvent(baseEvent);

      expect(mockStores.alertHistory.create).toHaveBeenCalledTimes(2);
      const statuses = mockStores.alertHistory.create.mock.calls.map(
        (c: unknown[]) => (c[0] as Record<string, unknown>).status,
      );
      expect(statuses).toEqual(['muted', 'muted']);
    });

    it('should suppress recovery alert when dependency is muted', async () => {
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(true);

      const recoveryEvent: AlertEvent = {
        ...baseEvent,
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
      };

      await service.processEvent(recoveryEvent);

      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should not suppress when dependency is not muted', async () => {
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(false);

      await service.processEvent(baseEvent);

      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should pass canonical name to isEffectivelyMuted', async () => {
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(false);
      mockStores.dependencies.findById.mockReturnValue({
        id: 'dep-1',
        name: 'postgres-main',
        service_id: 'svc-1',
        canonical_name: 'postgresql',
      });

      await service.processEvent(baseEvent);

      expect(mockStores.alertMutes.isEffectivelyMuted).toHaveBeenCalledWith(
        'dep-1', 'team-1', 'postgresql',
      );
    });

    it('should skip mute check when no dependencyId', async () => {
      const noDep: AlertEvent = { ...baseEvent, dependencyId: undefined };
      mockStores.alertMutes.isEffectivelyMuted.mockReturnValue(true);

      await service.processEvent(noDep);

      expect(mockStores.alertMutes.isEffectivelyMuted).not.toHaveBeenCalled();
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Service mute check ----

  describe('service mute check', () => {
    it('should suppress poll_error when service is muted', async () => {
      mockStores.alertMutes.isServiceMuted.mockReturnValue(true);

      const pollErrorEvent: AlertEvent = {
        eventType: 'poll_error',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        error: 'Connection refused',
        timestamp: '2026-01-01T00:00:00Z',
      };

      await service.processEvent(pollErrorEvent);

      expect(mockSender.send).not.toHaveBeenCalled();
      expect(mockStores.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'muted' }),
      );
    });

    it('should dispatch poll_error when service is NOT muted', async () => {
      mockStores.alertMutes.isServiceMuted.mockReturnValue(false);

      const pollErrorEvent: AlertEvent = {
        eventType: 'poll_error',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        error: 'Connection refused',
        timestamp: '2026-01-01T00:00:00Z',
      };

      await service.processEvent(pollErrorEvent);

      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should NOT suppress status_change by service mute', async () => {
      mockStores.alertMutes.isServiceMuted.mockReturnValue(true);

      const statusEvent: AlertEvent = {
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        dependencyId: 'dep-1',
        dependencyName: 'postgres-main',
        severity: 'critical',
        previousHealthy: true,
        currentHealthy: false,
        timestamp: '2026-01-01T00:00:00Z',
      };

      await service.processEvent(statusEvent);

      // isServiceMuted should not be called for status_change events
      // (service mute check is gated on eventType === 'poll_error')
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Delay check ----

  describe('delay check', () => {
    const baseEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'svc-1',
      serviceName: 'Test Service',
      dependencyId: 'dep-1',
      severity: 'critical',
      previousHealthy: true,
      currentHealthy: false,
      timestamp: '2026-01-01T00:00:00Z',
    };

    it('should suppress first unhealthy event when delay is configured', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      await service.processEvent(baseEvent);

      // First event should be suppressed — delay tracking started
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should suppress events within delay threshold', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      // First unhealthy — starts tracking
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();

      // Second unhealthy after 2 minutes — still within threshold
      jest.setSystemTime(new Date('2026-01-01T00:02:00Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should dispatch after delay threshold is crossed', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      // First unhealthy
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();

      // After 5 minutes — threshold crossed
      jest.setSystemTime(new Date('2026-01-01T00:05:01Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should skip recovery alert if delayed alert was never sent', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      // Start delay tracking
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled();

      // Recovery before threshold crossed
      jest.setSystemTime(new Date('2026-01-01T00:02:00Z'));
      const recoveryEvent: AlertEvent = {
        ...baseEvent,
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
      };
      await service.processEvent(recoveryEvent);

      // Recovery should also be suppressed (no alert was ever sent)
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should send recovery alert if delayed alert was dispatched', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      // Start delay tracking
      await service.processEvent(baseEvent);

      // Threshold crossed — alert sent
      jest.setSystemTime(new Date('2026-01-01T00:05:01Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);

      // Recovery — should be sent since alert was dispatched
      jest.setSystemTime(new Date('2026-01-01T00:06:00Z'));
      const recoveryEvent: AlertEvent = {
        ...baseEvent,
        severity: 'warning',
        previousHealthy: false,
        currentHealthy: true,
      };
      await service.processEvent(recoveryEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(2);
    });

    it('should not apply delay when alert_delay_minutes is null', async () => {
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: null },
      ]);

      await service.processEvent(baseEvent);
      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should clear delay state on shutdown', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockStores.alertRules.findActiveByTeamId.mockReturnValue([
        { ...mockRule, alert_delay_minutes: 5 },
      ]);

      await service.processEvent(baseEvent);
      service.shutdown();

      // Re-setup
      const newEmitter = new EventEmitter();
      service = new AlertService(
        mockStores as unknown as StoreRegistry,
        mockSettings as unknown as SettingsService,
      );
      service.registerSender('slack', mockSender);
      service.start(newEmitter);

      // First event on fresh service should start new tracking
      jest.setSystemTime(new Date('2026-01-01T00:10:00Z'));
      await service.processEvent(baseEvent);
      expect(mockSender.send).not.toHaveBeenCalled(); // still suppressed (new tracking)
    });
  });

  // ---- History recording resilience ----

  describe('history recording', () => {
    it('should not throw when history recording fails', async () => {
      mockStores.alertHistory.create.mockImplementation(() => {
        throw new Error('DB error');
      });

      // Should not throw
      await service.processEvent({
        eventType: 'status_change',
        serviceId: 'svc-1',
        serviceName: 'Test Service',
        severity: 'critical',
        timestamp: '2026-01-01T00:00:00Z',
      });
    });
  });
});
