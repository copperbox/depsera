import { formatRelativeTime } from './formatting';

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
});
