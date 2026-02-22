import { CircuitBreaker } from './CircuitBreaker';

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
    expect(cb.canAttempt()).toBe(true);
  });

  it('should stay closed below failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');
    expect(cb.canAttempt()).toBe(true);
  });

  it('should open after reaching failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canAttempt()).toBe(false);
  });

  it('should transition to half-open after cooldown', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canAttempt()).toBe(false);

    // Wait for cooldown
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(cb.canAttempt()).toBe(true);
        expect(cb.getState()).toBe('half-open');
        resolve();
      }, 60);
    });
  });

  it('should close on success from half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
    cb.recordFailure();

    return new Promise<void>(resolve => {
      setTimeout(() => {
        cb.canAttempt(); // transition to half-open
        cb.recordSuccess();
        expect(cb.getState()).toBe('closed');
        expect(cb.getFailureCount()).toBe(0);
        resolve();
      }, 20);
    });
  });

  it('should re-open on failure from half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
    cb.recordFailure();

    return new Promise<void>(resolve => {
      setTimeout(() => {
        cb.canAttempt(); // transition to half-open
        cb.recordFailure();
        expect(cb.getState()).toBe('open');
        resolve();
      }, 20);
    });
  });

  it('should reset failures on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getFailureCount()).toBe(2);

    cb.recordSuccess();
    expect(cb.getFailureCount()).toBe(0);
    expect(cb.getState()).toBe('closed');
  });

  it('should use default config values', () => {
    const cb = new CircuitBreaker();
    // Need 10 failures to open by default
    for (let i = 0; i < 9; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('closed');
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
  });

  it('should expose cooldown ms', () => {
    const cb = new CircuitBreaker({ cooldownMs: 60000 });
    expect(cb.getCooldownMs()).toBe(60000);
  });
});
