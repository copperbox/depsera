import { PollCache } from './PollCache';

describe('PollCache', () => {
  let cache: PollCache;

  beforeEach(() => {
    cache = new PollCache();
  });

  it('should return true for unknown service (cache miss)', () => {
    expect(cache.shouldPoll('svc-1')).toBe(true);
  });

  it('should return false after marking polled (within TTL)', () => {
    cache.markPolled('svc-1', 60000);
    expect(cache.shouldPoll('svc-1')).toBe(false);
  });

  it('should return true after TTL expires', () => {
    cache.markPolled('svc-1', 10);
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(cache.shouldPoll('svc-1')).toBe(true);
        resolve();
      }, 20);
    });
  });

  it('should allow immediate re-poll after invalidate', () => {
    cache.markPolled('svc-1', 60000);
    expect(cache.shouldPoll('svc-1')).toBe(false);

    cache.invalidate('svc-1');
    expect(cache.shouldPoll('svc-1')).toBe(true);
  });

  it('should remove an entry', () => {
    cache.markPolled('svc-1', 60000);
    cache.remove('svc-1');
    expect(cache.shouldPoll('svc-1')).toBe(true);
  });

  it('should clear all entries', () => {
    cache.markPolled('svc-1', 60000);
    cache.markPolled('svc-2', 60000);
    cache.clear();
    expect(cache.shouldPoll('svc-1')).toBe(true);
    expect(cache.shouldPoll('svc-2')).toBe(true);
  });

  it('should handle multiple services independently', () => {
    cache.markPolled('svc-1', 60000);
    cache.markPolled('svc-2', 10);

    expect(cache.shouldPoll('svc-1')).toBe(false);

    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(cache.shouldPoll('svc-1')).toBe(false);
        expect(cache.shouldPoll('svc-2')).toBe(true);
        resolve();
      }, 20);
    });
  });
});
