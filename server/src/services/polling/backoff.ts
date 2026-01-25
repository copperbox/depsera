export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

const DEFAULT_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  multiplier: 2,
};

export class ExponentialBackoff {
  private attempt = 0;
  private config: BackoffConfig;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getNextDelay(): number {
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(this.config.multiplier, this.attempt),
      this.config.maxDelayMs
    );
    this.attempt++;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }

  getAttemptCount(): number {
    return this.attempt;
  }
}
