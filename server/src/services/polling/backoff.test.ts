import { ExponentialBackoff } from './backoff';

describe('ExponentialBackoff', () => {
  describe('constructor', () => {
    it('should use default config', () => {
      const backoff = new ExponentialBackoff();
      expect(backoff.getAttemptCount()).toBe(0);
    });

    it('should accept custom config', () => {
      const backoff = new ExponentialBackoff({
        baseDelayMs: 500,
        maxDelayMs: 10000,
        multiplier: 3,
      });
      expect(backoff.getNextDelay()).toBe(500);
      expect(backoff.getNextDelay()).toBe(1500); // 500 * 3
    });

    it('should merge partial config with defaults', () => {
      const backoff = new ExponentialBackoff({ baseDelayMs: 2000 });
      expect(backoff.getNextDelay()).toBe(2000);
      expect(backoff.getNextDelay()).toBe(4000); // 2000 * 2 (default multiplier)
    });
  });

  describe('getNextDelay', () => {
    it('should return base delay on first call', () => {
      const backoff = new ExponentialBackoff({ baseDelayMs: 1000 });
      expect(backoff.getNextDelay()).toBe(1000);
    });

    it('should increase exponentially with each call', () => {
      const backoff = new ExponentialBackoff({
        baseDelayMs: 1000,
        multiplier: 2,
      });

      expect(backoff.getNextDelay()).toBe(1000); // attempt 0: 1000 * 2^0
      expect(backoff.getNextDelay()).toBe(2000); // attempt 1: 1000 * 2^1
      expect(backoff.getNextDelay()).toBe(4000); // attempt 2: 1000 * 2^2
      expect(backoff.getNextDelay()).toBe(8000); // attempt 3: 1000 * 2^3
    });

    it('should cap at maxDelayMs', () => {
      const backoff = new ExponentialBackoff({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
      });

      expect(backoff.getNextDelay()).toBe(1000);
      expect(backoff.getNextDelay()).toBe(2000);
      expect(backoff.getNextDelay()).toBe(4000);
      expect(backoff.getNextDelay()).toBe(5000); // Capped at max
      expect(backoff.getNextDelay()).toBe(5000); // Still capped
    });

    it('should increment attempt count', () => {
      const backoff = new ExponentialBackoff();
      expect(backoff.getAttemptCount()).toBe(0);
      backoff.getNextDelay();
      expect(backoff.getAttemptCount()).toBe(1);
      backoff.getNextDelay();
      expect(backoff.getAttemptCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset attempt count to 0', () => {
      const backoff = new ExponentialBackoff({ baseDelayMs: 1000 });
      backoff.getNextDelay();
      backoff.getNextDelay();
      expect(backoff.getAttemptCount()).toBe(2);

      backoff.reset();
      expect(backoff.getAttemptCount()).toBe(0);
    });

    it('should reset delays after reset', () => {
      const backoff = new ExponentialBackoff({ baseDelayMs: 1000 });
      backoff.getNextDelay(); // 1000
      backoff.getNextDelay(); // 2000
      backoff.getNextDelay(); // 4000

      backoff.reset();
      expect(backoff.getNextDelay()).toBe(1000); // Back to base
    });
  });

  describe('getAttemptCount', () => {
    it('should return current attempt count', () => {
      const backoff = new ExponentialBackoff();
      expect(backoff.getAttemptCount()).toBe(0);
      backoff.getNextDelay();
      expect(backoff.getAttemptCount()).toBe(1);
      backoff.getNextDelay();
      backoff.getNextDelay();
      expect(backoff.getAttemptCount()).toBe(3);
    });
  });
});
