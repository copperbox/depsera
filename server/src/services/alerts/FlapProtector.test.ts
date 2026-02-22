import { FlapProtector } from './FlapProtector';

describe('FlapProtector', () => {
  let protector: FlapProtector;

  beforeEach(() => {
    protector = new FlapProtector();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not suppress first alert for a key', () => {
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(false);
  });

  it('should suppress alert within cooldown window', () => {
    protector.recordAlert('dep-1');
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(true);
  });

  it('should not suppress alert after cooldown expires', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    protector.recordAlert('dep-1');

    // Advance past cooldown
    jest.setSystemTime(new Date('2026-01-01T00:05:01Z'));
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(false);
  });

  it('should track keys independently', () => {
    protector.recordAlert('dep-1');
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(true);
    expect(protector.isSuppressed('dep-2', 5 * 60_000)).toBe(false);
  });

  it('should not suppress when cooldown is zero', () => {
    protector.recordAlert('dep-1');
    expect(protector.isSuppressed('dep-1', 0)).toBe(false);
  });

  it('should not suppress when cooldown is negative', () => {
    protector.recordAlert('dep-1');
    expect(protector.isSuppressed('dep-1', -1)).toBe(false);
  });

  it('should clear all tracked cooldowns', () => {
    protector.recordAlert('dep-1');
    protector.recordAlert('dep-2');
    expect(protector.size).toBe(2);

    protector.clear();
    expect(protector.size).toBe(0);
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(false);
  });

  it('should update last alert time on re-record', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    protector.recordAlert('dep-1');

    // Advance 3 minutes and re-record
    jest.setSystemTime(new Date('2026-01-01T00:03:00Z'));
    protector.recordAlert('dep-1');

    // 4 minutes after second record: still within 5-min cooldown
    jest.setSystemTime(new Date('2026-01-01T00:07:00Z'));
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(true);

    // 6 minutes after second record: past cooldown
    jest.setSystemTime(new Date('2026-01-01T00:09:00Z'));
    expect(protector.isSuppressed('dep-1', 5 * 60_000)).toBe(false);
  });
});
