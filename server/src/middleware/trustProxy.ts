/**
 * Parse the TRUST_PROXY environment variable into a value suitable for
 * Express's `trust proxy` setting.
 *
 * - undefined / "" → false
 * - "true" / "false" → boolean
 * - Numeric string → number (hop count)
 * - Anything else → passed through as string (IP, subnet, "loopback", comma-separated)
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '') {
    return false;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  const num = Number(value);
  if (Number.isFinite(num) && String(num) === value) {
    return num;
  }

  return value;
}
