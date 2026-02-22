import { AlertRateLimiter } from './AlertRateLimiter';

describe('AlertRateLimiter', () => {
  let limiter: AlertRateLimiter;

  beforeEach(() => {
    limiter = new AlertRateLimiter();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not limit when no alerts have been sent', () => {
    expect(limiter.isLimited('team-1', 30)).toBe(false);
  });

  it('should not limit when under the threshold', () => {
    for (let i = 0; i < 29; i++) {
      limiter.recordAlert('team-1');
    }
    expect(limiter.isLimited('team-1', 30)).toBe(false);
  });

  it('should limit when at the threshold', () => {
    for (let i = 0; i < 30; i++) {
      limiter.recordAlert('team-1');
    }
    expect(limiter.isLimited('team-1', 30)).toBe(true);
  });

  it('should limit when over the threshold', () => {
    for (let i = 0; i < 35; i++) {
      limiter.recordAlert('team-1');
    }
    expect(limiter.isLimited('team-1', 30)).toBe(true);
  });

  it('should track teams independently', () => {
    for (let i = 0; i < 30; i++) {
      limiter.recordAlert('team-1');
    }
    expect(limiter.isLimited('team-1', 30)).toBe(true);
    expect(limiter.isLimited('team-2', 30)).toBe(false);
  });

  it('should reset window after one hour', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    for (let i = 0; i < 30; i++) {
      limiter.recordAlert('team-1');
    }
    expect(limiter.isLimited('team-1', 30)).toBe(true);

    // Advance past one hour
    jest.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    expect(limiter.isLimited('team-1', 30)).toBe(false);
  });

  it('should start fresh count after window reset', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    for (let i = 0; i < 30; i++) {
      limiter.recordAlert('team-1');
    }

    // Advance past one hour and record a new alert
    jest.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    limiter.recordAlert('team-1');
    expect(limiter.isLimited('team-1', 30)).toBe(false);
  });

  it('should clear all state', () => {
    limiter.recordAlert('team-1');
    limiter.recordAlert('team-2');
    expect(limiter.size).toBe(2);

    limiter.clear();
    expect(limiter.size).toBe(0);
  });
});
