import {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  isBlockedHostname,
  validateUrlHostname,
  validateUrlNotPrivate,
} from './ssrf';
import { clearAllowlistCache } from './ssrf-allowlist';
import dns from 'dns';
import net from 'net';

jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn(),
  },
}));

// net.isIP/isIPv4/isIPv6 are needed by the module - provide real implementations
jest.mock('net', () => ({
  isIP: (ip: string) => {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return 4;
    if (ip.includes(':')) return 6;
    return 0;
  },
  isIPv4: (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip),
  isIPv6: (ip: string) => ip.includes(':'),
}));

const mockDnsLookup = dns.promises.lookup as jest.MockedFunction<typeof dns.promises.lookup>;

describe('SSRF Protection', () => {
  describe('isPrivateIPv4', () => {
    it('should block loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateIPv4('127.255.255.255')).toBe(true);
    });

    it('should block RFC 1918 - 10.0.0.0/8', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('10.255.255.255')).toBe(true);
    });

    it('should block RFC 1918 - 172.16.0.0/12', () => {
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('172.15.255.255')).toBe(false);
      expect(isPrivateIPv4('172.32.0.0')).toBe(false);
    });

    it('should block RFC 1918 - 192.168.0.0/16', () => {
      expect(isPrivateIPv4('192.168.0.1')).toBe(true);
      expect(isPrivateIPv4('192.168.255.255')).toBe(true);
    });

    it('should block link-local (169.254.0.0/16)', () => {
      expect(isPrivateIPv4('169.254.0.1')).toBe(true);
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
    });

    it('should block current network (0.0.0.0/8)', () => {
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateIPv4('0.255.255.255')).toBe(true);
    });

    it('should block carrier-grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateIPv4('100.64.0.1')).toBe(true);
      expect(isPrivateIPv4('100.127.255.255')).toBe(true);
      expect(isPrivateIPv4('100.128.0.0')).toBe(false);
    });

    it('should block IETF protocol assignments (192.0.0.0/24)', () => {
      expect(isPrivateIPv4('192.0.0.1')).toBe(true);
    });

    it('should block TEST-NET ranges', () => {
      expect(isPrivateIPv4('192.0.2.1')).toBe(true);
      expect(isPrivateIPv4('198.51.100.1')).toBe(true);
      expect(isPrivateIPv4('203.0.113.1')).toBe(true);
    });

    it('should block multicast (224.0.0.0/4)', () => {
      expect(isPrivateIPv4('224.0.0.1')).toBe(true);
      expect(isPrivateIPv4('239.255.255.255')).toBe(true);
    });

    it('should block reserved (240.0.0.0/4)', () => {
      expect(isPrivateIPv4('240.0.0.1')).toBe(true);
      expect(isPrivateIPv4('255.255.255.255')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('93.184.216.34')).toBe(false);
      expect(isPrivateIPv4('203.0.114.1')).toBe(false);
    });

    it('should block unparseable IPs', () => {
      expect(isPrivateIPv4('not-an-ip')).toBe(true);
      expect(isPrivateIPv4('256.0.0.1')).toBe(true);
      expect(isPrivateIPv4('1.2.3')).toBe(true);
    });
  });

  describe('isPrivateIPv6', () => {
    it('should block loopback (::1)', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('0000:0000:0000:0000:0000:0000:0000:0001')).toBe(true);
    });

    it('should block unspecified (::)', () => {
      expect(isPrivateIPv6('::')).toBe(true);
    });

    it('should block link-local (fe80::/10)', () => {
      expect(isPrivateIPv6('fe80::1')).toBe(true);
      expect(isPrivateIPv6('fe80::abcd:1234')).toBe(true);
    });

    it('should block unique local (fc00::/7)', () => {
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd00::1')).toBe(true);
    });

    it('should block IPv4-mapped private addresses', () => {
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    });

    it('should allow IPv4-mapped public addresses', () => {
      expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
    });

    it('should allow public IPv6 addresses', () => {
      expect(isPrivateIPv6('2001:db8::1')).toBe(false);
      expect(isPrivateIPv6('2607:f8b0:4004:800::200e')).toBe(false);
    });
  });

  describe('isPrivateIP', () => {
    it('should detect private IPv4', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('8.8.8.8')).toBe(false);
    });

    it('should detect private IPv6', () => {
      expect(isPrivateIP('::1')).toBe(true);
    });

    it('should block unparseable addresses', () => {
      expect(isPrivateIP('not-valid')).toBe(true);
    });
  });

  describe('isBlockedHostname', () => {
    it('should block localhost', () => {
      expect(isBlockedHostname('localhost')).toBe(true);
      expect(isBlockedHostname('LOCALHOST')).toBe(true);
      expect(isBlockedHostname('localhost.')).toBe(true);
    });

    it('should block .local domains', () => {
      expect(isBlockedHostname('my-machine.local')).toBe(true);
    });

    it('should block .internal domains', () => {
      expect(isBlockedHostname('service.internal')).toBe(true);
    });

    it('should block .localhost subdomains', () => {
      expect(isBlockedHostname('evil.localhost')).toBe(true);
    });

    it('should allow public hostnames', () => {
      expect(isBlockedHostname('example.com')).toBe(false);
      expect(isBlockedHostname('api.example.com')).toBe(false);
    });
  });

  describe('validateUrlHostname', () => {
    it('should allow public URLs', () => {
      expect(() => validateUrlHostname('https://example.com/health')).not.toThrow();
      expect(() => validateUrlHostname('https://8.8.8.8/health')).not.toThrow();
    });

    it('should block localhost URLs', () => {
      expect(() => validateUrlHostname('http://localhost:3001/api')).toThrow('Blocked hostname');
    });

    it('should block private IP URLs', () => {
      expect(() => validateUrlHostname('http://127.0.0.1:3001/api')).toThrow('Blocked private IP');
      expect(() => validateUrlHostname('http://192.168.1.1:8080/admin')).toThrow('Blocked private IP');
      expect(() => validateUrlHostname('http://10.0.0.1/health')).toThrow('Blocked private IP');
      expect(() => validateUrlHostname('http://169.254.169.254/latest/meta-data/')).toThrow('Blocked private IP');
    });

    it('should allow URLs with public hostnames', () => {
      expect(() => validateUrlHostname('https://api.example.com/health')).not.toThrow();
    });
  });

  describe('validateUrlNotPrivate', () => {
    beforeEach(() => {
      mockDnsLookup.mockReset();
    });

    it('should allow URLs resolving to public IPs', async () => {
      mockDnsLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

      await expect(validateUrlNotPrivate('https://example.com/health')).resolves.toBeUndefined();
    });

    it('should block URLs resolving to private IPs (DNS rebinding)', async () => {
      mockDnsLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });

      await expect(validateUrlNotPrivate('https://evil.com/health')).rejects.toThrow(
        'resolved to blocked private IP'
      );
    });

    it('should block URLs with private IP hostnames directly', async () => {
      await expect(validateUrlNotPrivate('http://192.168.1.1/health')).rejects.toThrow(
        'Blocked private IP'
      );
    });

    it('should block URLs with cloud metadata IP', async () => {
      await expect(validateUrlNotPrivate('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
        'Blocked private IP'
      );
    });

    it('should block localhost', async () => {
      await expect(validateUrlNotPrivate('http://localhost:3001/api')).rejects.toThrow(
        'Blocked hostname'
      );
    });

    it('should handle DNS resolution failure', async () => {
      mockDnsLookup.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(validateUrlNotPrivate('https://nonexistent.example.com/health')).rejects.toThrow(
        'DNS resolution failed'
      );
    });

    it('should block .internal hostnames', async () => {
      await expect(validateUrlNotPrivate('http://service.internal/health')).rejects.toThrow(
        'Blocked hostname'
      );
    });
  });

  describe('SSRF Allowlist integration', () => {
    const originalEnv = process.env.SSRF_ALLOWLIST;

    beforeEach(() => {
      clearAllowlistCache();
      mockDnsLookup.mockReset();
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SSRF_ALLOWLIST;
      } else {
        process.env.SSRF_ALLOWLIST = originalEnv;
      }
      clearAllowlistCache();
    });

    describe('validateUrlHostname with allowlist', () => {
      it('should allow localhost when in allowlist', () => {
        process.env.SSRF_ALLOWLIST = 'localhost';
        expect(() => validateUrlHostname('http://localhost:3001/api')).not.toThrow();
      });

      it('should allow .internal hostnames when pattern is in allowlist', () => {
        process.env.SSRF_ALLOWLIST = '*.internal';
        expect(() => validateUrlHostname('http://service.internal/health')).not.toThrow();
      });

      it('should allow private IPs when CIDR is in allowlist', () => {
        process.env.SSRF_ALLOWLIST = '127.0.0.0/8,192.168.0.0/16';
        expect(() => validateUrlHostname('http://127.0.0.1:3001/api')).not.toThrow();
        expect(() => validateUrlHostname('http://192.168.1.1:8080/admin')).not.toThrow();
      });

      it('should still block non-allowed private IPs', () => {
        process.env.SSRF_ALLOWLIST = '10.0.0.0/8';
        expect(() => validateUrlHostname('http://192.168.1.1/health')).toThrow('Blocked private IP');
      });

      it('should still block non-allowed hostnames', () => {
        process.env.SSRF_ALLOWLIST = '*.corp.com';
        expect(() => validateUrlHostname('http://localhost:3001/api')).toThrow('Blocked hostname');
      });

      it('should still block cloud metadata IP without explicit allowlist', () => {
        process.env.SSRF_ALLOWLIST = '10.0.0.0/8,192.168.0.0/16';
        expect(() => validateUrlHostname('http://169.254.169.254/latest/meta-data/')).toThrow('Blocked private IP');
      });
    });

    describe('validateUrlNotPrivate with allowlist', () => {
      it('should allow localhost when in allowlist', async () => {
        process.env.SSRF_ALLOWLIST = 'localhost';
        await expect(validateUrlNotPrivate('http://localhost:3001/api')).resolves.toBeUndefined();
        // Should not even attempt DNS lookup
        expect(mockDnsLookup).not.toHaveBeenCalled();
      });

      it('should allow .internal hostnames when pattern is in allowlist', async () => {
        process.env.SSRF_ALLOWLIST = '*.internal';
        await expect(validateUrlNotPrivate('http://service.internal/health')).resolves.toBeUndefined();
        expect(mockDnsLookup).not.toHaveBeenCalled();
      });

      it('should allow private IP when CIDR is in allowlist', async () => {
        process.env.SSRF_ALLOWLIST = '192.168.0.0/16';
        await expect(validateUrlNotPrivate('http://192.168.1.1/health')).resolves.toBeUndefined();
      });

      it('should allow DNS-resolved private IP when CIDR is in allowlist', async () => {
        process.env.SSRF_ALLOWLIST = '10.0.0.0/8';
        mockDnsLookup.mockResolvedValue({ address: '10.1.2.3', family: 4 });
        await expect(validateUrlNotPrivate('https://myservice.example.com/health')).resolves.toBeUndefined();
      });

      it('should still block DNS-resolved private IP not in allowlist', async () => {
        process.env.SSRF_ALLOWLIST = '10.0.0.0/8';
        mockDnsLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
        await expect(validateUrlNotPrivate('https://evil.com/health')).rejects.toThrow(
          'resolved to blocked private IP'
        );
      });

      it('should still block cloud metadata without explicit allowlist', async () => {
        process.env.SSRF_ALLOWLIST = '10.0.0.0/8,192.168.0.0/16,127.0.0.0/8';
        await expect(validateUrlNotPrivate('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
          'Blocked private IP'
        );
      });

      it('should block non-allowed hostname even with other allowlist entries', async () => {
        process.env.SSRF_ALLOWLIST = '*.corp.com';
        await expect(validateUrlNotPrivate('http://localhost:3001/api')).rejects.toThrow('Blocked hostname');
      });
    });
  });
});
