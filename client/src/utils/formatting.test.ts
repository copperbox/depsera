import { parseUtcDate, formatRelativeTime, formatTimestamp, formatDate } from './formatting';

describe('parseUtcDate', () => {
  it('parses ISO strings with Z suffix correctly', () => {
    const date = parseUtcDate('2024-01-15T14:30:00.000Z');
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z');
  });

  it('parses ISO strings with timezone offset correctly', () => {
    const date = parseUtcDate('2024-01-15T14:30:00+00:00');
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z');
  });

  it('parses SQLite datetime format as UTC', () => {
    // SQLite datetime("now") produces "YYYY-MM-DD HH:MM:SS" without Z
    const date = parseUtcDate('2024-01-15 14:30:00');
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z');
  });

  it('parses ISO string without Z as UTC', () => {
    const date = parseUtcDate('2024-01-15T14:30:00');
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "Never" for null input', () => {
    expect(formatRelativeTime(null)).toBe('Never');
  });

  it('returns "Just now" for times less than 60 seconds ago', () => {
    expect(formatRelativeTime('2024-01-15T11:59:30Z')).toBe('Just now');
    expect(formatRelativeTime('2024-01-15T11:59:01Z')).toBe('Just now');
  });

  it('returns minutes ago for times less than an hour ago', () => {
    expect(formatRelativeTime('2024-01-15T11:59:00Z')).toBe('1m ago');
    expect(formatRelativeTime('2024-01-15T11:30:00Z')).toBe('30m ago');
    expect(formatRelativeTime('2024-01-15T11:01:00Z')).toBe('59m ago');
  });

  it('returns hours ago for times less than a day ago', () => {
    expect(formatRelativeTime('2024-01-15T11:00:00Z')).toBe('1h ago');
    expect(formatRelativeTime('2024-01-15T00:00:00Z')).toBe('12h ago');
    expect(formatRelativeTime('2024-01-14T13:00:00Z')).toBe('23h ago');
  });

  it('returns days ago for times more than a day ago', () => {
    expect(formatRelativeTime('2024-01-14T12:00:00Z')).toBe('1d ago');
    expect(formatRelativeTime('2024-01-08T12:00:00Z')).toBe('7d ago');
    expect(formatRelativeTime('2024-01-01T12:00:00Z')).toBe('14d ago');
  });

  it('handles SQLite datetime format correctly', () => {
    // SQLite format without Z — should still compute correct relative time
    expect(formatRelativeTime('2024-01-15 11:30:00')).toBe('30m ago');
    expect(formatRelativeTime('2024-01-15 11:00:00')).toBe('1h ago');
  });
});

describe('formatTimestamp', () => {
  it('returns a localized string with month, day, hour, and minute', () => {
    const result = formatTimestamp('2024-01-15T14:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('uses local timezone (not raw UTC)', () => {
    const result = formatTimestamp('2024-06-15T00:00:00Z');
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
  });

  it('handles SQLite datetime format the same as ISO format', () => {
    // Both should produce the same result since they represent the same UTC instant
    const fromIso = formatTimestamp('2024-01-15T14:30:00Z');
    const fromSqlite = formatTimestamp('2024-01-15 14:30:00');
    expect(fromSqlite).toBe(fromIso);
  });
});

describe('formatDate', () => {
  it('returns a localized date string with month, day, and year', () => {
    const result = formatDate('2024-01-15T14:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('2024');
  });

  it('uses local timezone (not raw UTC)', () => {
    const result = formatDate('2024-06-15T00:00:00Z');
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
  });

  it('handles SQLite datetime format the same as ISO format', () => {
    const fromIso = formatDate('2024-01-15T14:30:00Z');
    const fromSqlite = formatDate('2024-01-15 14:30:00');
    expect(fromSqlite).toBe(fromIso);
  });
});
