import { isValidDuration, parseDuration } from './duration';

describe('isValidDuration', () => {
  it('returns true for valid durations', () => {
    expect(isValidDuration('30m')).toBe(true);
    expect(isValidDuration('2h')).toBe(true);
    expect(isValidDuration('1d')).toBe(true);
    expect(isValidDuration('120m')).toBe(true);
  });

  it('returns false for invalid durations', () => {
    expect(isValidDuration('')).toBe(false);
    expect(isValidDuration('abc')).toBe(false);
    expect(isValidDuration('30')).toBe(false);
    expect(isValidDuration('m30')).toBe(false);
    expect(isValidDuration('30s')).toBe(false);
    expect(isValidDuration('30min')).toBe(false);
    expect(isValidDuration('-5m')).toBe(false);
  });
});

describe('parseDuration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses minutes correctly', () => {
    const result = parseDuration('30m');
    expect(result.toISOString()).toBe('2026-03-01T12:30:00.000Z');
  });

  it('parses hours correctly', () => {
    const result = parseDuration('2h');
    expect(result.toISOString()).toBe('2026-03-01T14:00:00.000Z');
  });

  it('parses days correctly', () => {
    const result = parseDuration('1d');
    expect(result.toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });

  it('throws on invalid format', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration format');
    expect(() => parseDuration('30s')).toThrow('Invalid duration format');
    expect(() => parseDuration('')).toThrow('Invalid duration format');
  });

  it('throws on zero value', () => {
    expect(() => parseDuration('0m')).toThrow('Duration value must be positive');
  });
});
