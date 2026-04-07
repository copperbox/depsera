const DURATION_PATTERN = /^(\d+)([mhd])$/;

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Validate a duration string (e.g., '30m', '2h', '1d').
 */
export function isValidDuration(duration: string): boolean {
  return DURATION_PATTERN.test(duration);
}

/**
 * Parse a duration string to an absolute expiry Date.
 * @param duration — format: `<number><unit>` where unit is m (minutes), h (hours), d (days)
 * @returns Date representing when the duration expires from now
 * @throws Error if format is invalid
 */
export function parseDuration(duration: string): Date {
  const match = duration.match(DURATION_PATTERN);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected format: <number><m|h|d>`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value <= 0) {
    throw new Error('Duration value must be positive');
  }

  const ms = value * UNIT_MS[unit]; // eslint-disable-line security/detect-object-injection
  return new Date(Date.now() + ms);
}
