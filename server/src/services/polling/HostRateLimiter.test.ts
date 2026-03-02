import { HostRateLimiter } from './HostRateLimiter';

describe('HostRateLimiter', () => {
  it('should allow acquisitions under the limit', () => {
    const limiter = new HostRateLimiter(3);

    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(true);
  });

  it('should reject acquisitions at the limit', () => {
    const limiter = new HostRateLimiter(2);

    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(false);
  });

  it('should allow acquisition after release', () => {
    const limiter = new HostRateLimiter(1);

    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(false);

    limiter.release('example.com');

    expect(limiter.acquire('example.com')).toBe(true);
  });

  it('should track separate hostnames independently', () => {
    const limiter = new HostRateLimiter(1);

    expect(limiter.acquire('a.com')).toBe(true);
    expect(limiter.acquire('b.com')).toBe(true);

    // a.com is at capacity
    expect(limiter.acquire('a.com')).toBe(false);
    // b.com is at capacity
    expect(limiter.acquire('b.com')).toBe(false);
  });

  it('should handle release when count reaches zero', () => {
    const limiter = new HostRateLimiter(2);

    limiter.acquire('example.com');
    limiter.release('example.com');

    // Count should be 0, map entry cleaned up
    expect(limiter.getActiveCount('example.com')).toBe(0);
  });

  it('should handle release on unknown hostname', () => {
    const limiter = new HostRateLimiter(2);

    // Should not throw
    limiter.release('unknown.com');

    expect(limiter.getActiveCount('unknown.com')).toBe(0);
  });

  it('should extract hostname from URL', () => {
    expect(HostRateLimiter.getHostname('http://example.com/path')).toBe('example.com');
    expect(HostRateLimiter.getHostname('https://api.example.com:8080/health')).toBe('api.example.com');
    expect(HostRateLimiter.getHostname('http://localhost:4000/deps')).toBe('localhost');
  });

  it('should return raw string for invalid URLs', () => {
    expect(HostRateLimiter.getHostname('not-a-url')).toBe('not-a-url');
  });

  it('should report active count', () => {
    const limiter = new HostRateLimiter(5);

    expect(limiter.getActiveCount('example.com')).toBe(0);

    limiter.acquire('example.com');
    expect(limiter.getActiveCount('example.com')).toBe(1);

    limiter.acquire('example.com');
    expect(limiter.getActiveCount('example.com')).toBe(2);
  });

  it('should clear all state', () => {
    const limiter = new HostRateLimiter(5);

    limiter.acquire('a.com');
    limiter.acquire('b.com');

    limiter.clear();

    expect(limiter.getActiveCount('a.com')).toBe(0);
    expect(limiter.getActiveCount('b.com')).toBe(0);
  });

  it('should read max from env var', () => {
    const original = process.env.POLL_MAX_CONCURRENT_PER_HOST;
    process.env.POLL_MAX_CONCURRENT_PER_HOST = '1';

    const limiter = new HostRateLimiter();

    expect(limiter.acquire('example.com')).toBe(true);
    expect(limiter.acquire('example.com')).toBe(false);

    process.env.POLL_MAX_CONCURRENT_PER_HOST = original;
  });

  it('should use default when no env var or constructor arg', () => {
    const original = process.env.POLL_MAX_CONCURRENT_PER_HOST;
    delete process.env.POLL_MAX_CONCURRENT_PER_HOST;

    const limiter = new HostRateLimiter();

    // Default is 10
    for (let i = 0; i < 10; i++) {
      expect(limiter.acquire('example.com')).toBe(true);
    }
    expect(limiter.acquire('example.com')).toBe(false);

    process.env.POLL_MAX_CONCURRENT_PER_HOST = original;
  });
});
