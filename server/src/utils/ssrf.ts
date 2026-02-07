import dns from 'dns';
import net from 'net';
import { getAllowlist, matchesAllowlist, ipMatchesAllowlist } from './ssrf-allowlist';

const dnsLookup = dns.promises.lookup;

/**
 * Checks if an IPv4 address falls within private/reserved ranges.
 *
 * Blocked ranges:
 * - 127.0.0.0/8     (loopback)
 * - 10.0.0.0/8      (RFC 1918)
 * - 172.16.0.0/12   (RFC 1918)
 * - 192.168.0.0/16  (RFC 1918)
 * - 169.254.0.0/16  (link-local)
 * - 0.0.0.0/8       (current network)
 * - 100.64.0.0/10   (carrier-grade NAT)
 * - 192.0.0.0/24    (IETF protocol assignments)
 * - 192.0.2.0/24    (TEST-NET-1)
 * - 198.51.100.0/24 (TEST-NET-2)
 * - 203.0.113.0/24  (TEST-NET-3)
 * - 224.0.0.0/4     (multicast)
 * - 240.0.0.0/4     (reserved)
 * - 255.255.255.255 (broadcast)
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat unparseable IPs as private (block them)
  }

  const [a, b] = parts;

  // 0.0.0.0/8 - current network
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 - loopback
  if (a === 127) return true;
  // 169.254.0.0/16 - link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 - TEST-NET-1
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.51.100.0/24 - TEST-NET-2
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 - TEST-NET-3
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 - multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 - reserved
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private/reserved.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 - loopback
  if (normalized === '::1' || normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }
  // :: - unspecified
  if (normalized === '::' || normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return true;
  }
  // fe80::/10 - link-local
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  // fc00::/7 - unique local (fd00::/8 in practice)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  // ::ffff:0:0/96 - IPv4-mapped (check the mapped IPv4 portion)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7);
    if (ipv4Part.includes('.')) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  return false;
}

/**
 * Checks if an IP address (v4 or v6) is private/reserved.
 */
export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true; // Block unparseable addresses
}

/**
 * Checks if a hostname is a known local/private hostname.
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === 'localhost.' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  );
}

/**
 * Validates that a URL's hostname does not point to a private/reserved IP.
 * Performs DNS resolution to catch DNS rebinding attacks.
 *
 * If SSRF_ALLOWLIST is set, matching hostnames/IPs bypass the block checks.
 *
 * @throws Error if the URL resolves to a private IP or has a blocked hostname
 */
export async function validateUrlNotPrivate(urlString: string): Promise<void> {
  const url = new URL(urlString);
  const hostname = url.hostname;
  const allowlist = getAllowlist();

  // If hostname matches allowlist hostname/pattern, skip all checks
  if (matchesAllowlist(hostname, allowlist)) {
    return;
  }

  // If hostname is a literal IP and matches an allowlist CIDR, skip all checks
  if (net.isIP(hostname) && ipMatchesAllowlist(hostname, allowlist)) {
    return;
  }

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  // If hostname is already an IP, validate directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Blocked private IP: ${hostname}`);
    }
    return;
  }

  // Resolve DNS and validate the resolved IP
  try {
    const { address } = await dnsLookup(hostname);

    // Check if resolved IP matches allowlist CIDR before blocking
    if (isPrivateIP(address) && !ipMatchesAllowlist(address, allowlist)) {
      throw new Error(
        `Hostname ${hostname} resolved to blocked private IP: ${address}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Blocked')) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith('Hostname')) {
      throw error;
    }
    throw new Error(`DNS resolution failed for ${hostname}: ${(error as Error).message}`);
  }
}

/**
 * Synchronous URL validation for service creation/update.
 * Checks hostname patterns and literal IPs but does NOT resolve DNS.
 * Use validateUrlNotPrivate() for full DNS-resolving validation at poll time.
 *
 * If SSRF_ALLOWLIST is set, matching hostnames/IPs bypass the block checks.
 */
export function validateUrlHostname(urlString: string): void {
  const url = new URL(urlString);
  const hostname = url.hostname;
  const allowlist = getAllowlist();

  // If hostname matches allowlist hostname/pattern, allow it
  if (matchesAllowlist(hostname, allowlist)) {
    return;
  }

  // If hostname is a literal IP and matches an allowlist CIDR, allow it
  if (net.isIP(hostname) && ipMatchesAllowlist(hostname, allowlist)) {
    return;
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  if (net.isIP(hostname) && isPrivateIP(hostname)) {
    throw new Error(`Blocked private IP address: ${hostname}`);
  }
}
