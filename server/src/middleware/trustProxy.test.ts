import { parseTrustProxy } from './trustProxy';

describe('parseTrustProxy', () => {
  it('should return false for undefined', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(parseTrustProxy('')).toBe(false);
  });

  it('should return true for "true"', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('should return false for "false"', () => {
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('should return a number for numeric string', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('3')).toBe(3);
  });

  it('should return 0 for "0"', () => {
    expect(parseTrustProxy('0')).toBe(0);
  });

  it('should return string for "loopback"', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  it('should return string for IP address', () => {
    expect(parseTrustProxy('127.0.0.1')).toBe('127.0.0.1');
  });

  it('should return string for subnet', () => {
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('should return string for comma-separated values', () => {
    expect(parseTrustProxy('loopback,10.0.0.0/8')).toBe('loopback,10.0.0.0/8');
  });
});
