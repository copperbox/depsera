import net from 'net';
import { SettingsService } from '../services/settings/SettingsService';

export interface ParsedCIDR {
  ip: number;   // 32-bit integer for base IP
  mask: number;  // 32-bit mask from prefix length
}

export interface SsrfAllowlist {
  hostnames: string[];
  patterns: string[];
  cidrs: ParsedCIDR[];
}

const EMPTY_ALLOWLIST: SsrfAllowlist = { hostnames: [], patterns: [], cidrs: [] };

let cachedAllowlist: SsrfAllowlist | null = null;
let cachedRawValue: string | undefined;

/**
 * Convert an IPv4 address string to a 32-bit unsigned integer.
 */
export function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Parse a CIDR notation string (e.g. "10.0.0.0/8") into base IP and mask.
 */
export function parseCIDR(cidr: string): ParsedCIDR {
  const [ip, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (!net.isIPv4(ip) || isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { ip: (ipToInt(ip) & mask) >>> 0, mask };
}

/**
 * Check if an IPv4 address falls within a parsed CIDR range.
 */
export function ipMatchesCIDR(ip: string, cidr: ParsedCIDR): boolean {
  return ((ipToInt(ip) & cidr.mask) >>> 0) === cidr.ip;
}

/**
 * Parse the SSRF_ALLOWLIST env var value into a structured allowlist.
 *
 * Supported entry formats:
 * - Exact hostnames: "localhost"
 * - Wildcard patterns: "*.internal", "*.corp.com"
 * - CIDR ranges: "10.0.0.0/8", "172.16.0.0/12"
 */
export function parseSsrfAllowlist(value: string): SsrfAllowlist {
  if (!value.trim()) {
    return EMPTY_ALLOWLIST;
  }

  const hostnames: string[] = [];
  const patterns: string[] = [];
  const cidrs: ParsedCIDR[] = [];

  const entries = value.split(',').map((e) => e.trim()).filter(Boolean);

  for (const entry of entries) {
    if (entry.includes('/')) {
      // CIDR notation
      cidrs.push(parseCIDR(entry));
    } else if (entry.startsWith('*.')) {
      // Wildcard pattern
      patterns.push(entry.toLowerCase());
    } else {
      // Exact hostname
      hostnames.push(entry.toLowerCase());
    }
  }

  return { hostnames, patterns, cidrs };
}

/**
 * Check if a hostname matches the allowlist via exact match or wildcard pattern.
 */
export function matchesAllowlist(hostname: string, allowlist: SsrfAllowlist): boolean {
  const lower = hostname.toLowerCase();

  // Exact hostname match
  if (allowlist.hostnames.includes(lower)) {
    return true;
  }

  // Wildcard pattern match (e.g. *.internal matches service.internal and a.b.internal)
  for (const pattern of allowlist.patterns) {
    const suffix = pattern.slice(1); // "*.internal" -> ".internal"
    if (lower.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an IPv4 address matches any CIDR range in the allowlist.
 */
export function ipMatchesAllowlist(ip: string, allowlist: SsrfAllowlist): boolean {
  if (!net.isIPv4(ip)) {
    return false;
  }

  for (const cidr of allowlist.cidrs) {
    if (ipMatchesCIDR(ip, cidr)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the effective SSRF allowlist value.
 * Checks SettingsService (DB value from admin settings) first,
 * then falls back to the SSRF_ALLOWLIST env var.
 */
function getEffectiveAllowlistValue(): string | undefined {
  const settings = SettingsService.tryGetInstance();
  if (settings) {
    const dbValue = settings.get('ssrf_allowlist');
    if (dbValue) return dbValue;
  }
  return process.env.SSRF_ALLOWLIST;
}

/**
 * Get the parsed SSRF allowlist.
 * Reads from SettingsService (admin settings DB) first, falling back to
 * the SSRF_ALLOWLIST env var. Returns an empty allowlist if neither is set.
 * Cache is invalidated when the effective value changes.
 */
export function getAllowlist(): SsrfAllowlist {
  const rawValue = getEffectiveAllowlistValue();

  if (cachedAllowlist !== null && cachedRawValue === rawValue) {
    return cachedAllowlist;
  }

  cachedRawValue = rawValue;
  cachedAllowlist = rawValue ? parseSsrfAllowlist(rawValue) : EMPTY_ALLOWLIST;
  return cachedAllowlist;
}

/**
 * Clear the cached allowlist. Useful for testing.
 */
export function clearAllowlistCache(): void {
  cachedAllowlist = null;
  cachedRawValue = undefined;
}
