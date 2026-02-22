import {
  ipToInt,
  parseCIDR,
  ipMatchesCIDR,
  parseSsrfAllowlist,
  matchesAllowlist,
  ipMatchesAllowlist,
  getAllowlist,
  clearAllowlistCache,
} from './ssrf-allowlist';
import { SettingsService } from '../services/settings/SettingsService';

jest.mock('net', () => ({
  isIPv4: (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip),
}));

describe('SSRF Allowlist', () => {
  describe('ipToInt', () => {
    it('should convert 0.0.0.0 to 0', () => {
      expect(ipToInt('0.0.0.0')).toBe(0);
    });

    it('should convert 255.255.255.255 to max uint32', () => {
      expect(ipToInt('255.255.255.255')).toBe(0xffffffff);
    });

    it('should convert 10.0.0.1 correctly', () => {
      expect(ipToInt('10.0.0.1')).toBe(0x0a000001);
    });

    it('should convert 192.168.1.100 correctly', () => {
      expect(ipToInt('192.168.1.100')).toBe((192 << 24 | 168 << 16 | 1 << 8 | 100) >>> 0);
    });
  });

  describe('parseCIDR', () => {
    it('should parse 10.0.0.0/8', () => {
      const result = parseCIDR('10.0.0.0/8');
      expect(result.ip).toBe(ipToInt('10.0.0.0'));
      expect(result.mask).toBe(0xff000000);
    });

    it('should parse 172.16.0.0/12', () => {
      const result = parseCIDR('172.16.0.0/12');
      expect(result.ip).toBe(ipToInt('172.16.0.0'));
      expect(result.mask).toBe(0xfff00000);
    });

    it('should parse 192.168.0.0/16', () => {
      const result = parseCIDR('192.168.0.0/16');
      expect(result.ip).toBe(ipToInt('192.168.0.0'));
      expect(result.mask).toBe(0xffff0000);
    });

    it('should parse 127.0.0.0/8', () => {
      const result = parseCIDR('127.0.0.0/8');
      expect(result.ip).toBe(ipToInt('127.0.0.0'));
      expect(result.mask).toBe(0xff000000);
    });

    it('should parse /32 (single host)', () => {
      const result = parseCIDR('1.2.3.4/32');
      expect(result.mask).toBe(0xffffffff);
    });

    it('should parse /0 (all addresses)', () => {
      const result = parseCIDR('0.0.0.0/0');
      expect(result.mask).toBe(0);
      expect(result.ip).toBe(0);
    });

    it('should mask off host bits in base IP', () => {
      const result = parseCIDR('10.1.2.3/8');
      expect(result.ip).toBe(ipToInt('10.0.0.0'));
    });

    it('should throw on invalid CIDR', () => {
      expect(() => parseCIDR('not-a-cidr/8')).toThrow('Invalid CIDR');
      expect(() => parseCIDR('10.0.0.0/33')).toThrow('Invalid CIDR');
      expect(() => parseCIDR('10.0.0.0/-1')).toThrow('Invalid CIDR');
      expect(() => parseCIDR('10.0.0.0/abc')).toThrow('Invalid CIDR');
    });
  });

  describe('ipMatchesCIDR', () => {
    it('should match IPs within 10.0.0.0/8', () => {
      const cidr = parseCIDR('10.0.0.0/8');
      expect(ipMatchesCIDR('10.0.0.1', cidr)).toBe(true);
      expect(ipMatchesCIDR('10.255.255.255', cidr)).toBe(true);
      expect(ipMatchesCIDR('10.1.2.3', cidr)).toBe(true);
    });

    it('should not match IPs outside 10.0.0.0/8', () => {
      const cidr = parseCIDR('10.0.0.0/8');
      expect(ipMatchesCIDR('11.0.0.1', cidr)).toBe(false);
      expect(ipMatchesCIDR('192.168.1.1', cidr)).toBe(false);
    });

    it('should match IPs within 192.168.0.0/16', () => {
      const cidr = parseCIDR('192.168.0.0/16');
      expect(ipMatchesCIDR('192.168.0.1', cidr)).toBe(true);
      expect(ipMatchesCIDR('192.168.255.255', cidr)).toBe(true);
    });

    it('should not match IPs outside 192.168.0.0/16', () => {
      const cidr = parseCIDR('192.168.0.0/16');
      expect(ipMatchesCIDR('192.169.0.1', cidr)).toBe(false);
    });

    it('should match exact host with /32', () => {
      const cidr = parseCIDR('1.2.3.4/32');
      expect(ipMatchesCIDR('1.2.3.4', cidr)).toBe(true);
      expect(ipMatchesCIDR('1.2.3.5', cidr)).toBe(false);
    });

    it('should match everything with /0', () => {
      const cidr = parseCIDR('0.0.0.0/0');
      expect(ipMatchesCIDR('1.2.3.4', cidr)).toBe(true);
      expect(ipMatchesCIDR('255.255.255.255', cidr)).toBe(true);
    });

    it('should match IPs within 172.16.0.0/12', () => {
      const cidr = parseCIDR('172.16.0.0/12');
      expect(ipMatchesCIDR('172.16.0.1', cidr)).toBe(true);
      expect(ipMatchesCIDR('172.31.255.255', cidr)).toBe(true);
      expect(ipMatchesCIDR('172.32.0.1', cidr)).toBe(false);
    });
  });

  describe('parseSsrfAllowlist', () => {
    it('should return empty allowlist for empty string', () => {
      const result = parseSsrfAllowlist('');
      expect(result.hostnames).toEqual([]);
      expect(result.patterns).toEqual([]);
      expect(result.cidrs).toEqual([]);
    });

    it('should return empty allowlist for whitespace', () => {
      const result = parseSsrfAllowlist('   ');
      expect(result.hostnames).toEqual([]);
    });

    it('should parse exact hostnames', () => {
      const result = parseSsrfAllowlist('localhost,myhost');
      expect(result.hostnames).toEqual(['localhost', 'myhost']);
      expect(result.patterns).toEqual([]);
      expect(result.cidrs).toEqual([]);
    });

    it('should parse wildcard patterns', () => {
      const result = parseSsrfAllowlist('*.internal,*.corp.com');
      expect(result.hostnames).toEqual([]);
      expect(result.patterns).toEqual(['*.internal', '*.corp.com']);
    });

    it('should parse CIDR ranges', () => {
      const result = parseSsrfAllowlist('10.0.0.0/8,192.168.0.0/16');
      expect(result.cidrs).toHaveLength(2);
    });

    it('should parse mixed entries', () => {
      const result = parseSsrfAllowlist('localhost,*.internal,10.0.0.0/8');
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.patterns).toEqual(['*.internal']);
      expect(result.cidrs).toHaveLength(1);
    });

    it('should handle whitespace around entries', () => {
      const result = parseSsrfAllowlist(' localhost , *.internal , 10.0.0.0/8 ');
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.patterns).toEqual(['*.internal']);
      expect(result.cidrs).toHaveLength(1);
    });

    it('should lowercase hostnames and patterns', () => {
      const result = parseSsrfAllowlist('LOCALHOST,*.INTERNAL');
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.patterns).toEqual(['*.internal']);
    });

    it('should skip empty entries from consecutive commas', () => {
      const result = parseSsrfAllowlist('localhost,,*.internal');
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.patterns).toEqual(['*.internal']);
    });
  });

  describe('matchesAllowlist', () => {
    it('should match exact hostname', () => {
      const allowlist = parseSsrfAllowlist('localhost,myhost');
      expect(matchesAllowlist('localhost', allowlist)).toBe(true);
      expect(matchesAllowlist('myhost', allowlist)).toBe(true);
    });

    it('should match case-insensitively', () => {
      const allowlist = parseSsrfAllowlist('localhost');
      expect(matchesAllowlist('LOCALHOST', allowlist)).toBe(true);
      expect(matchesAllowlist('Localhost', allowlist)).toBe(true);
    });

    it('should not match unrelated hostnames', () => {
      const allowlist = parseSsrfAllowlist('localhost');
      expect(matchesAllowlist('example.com', allowlist)).toBe(false);
    });

    it('should match wildcard patterns', () => {
      const allowlist = parseSsrfAllowlist('*.internal');
      expect(matchesAllowlist('service.internal', allowlist)).toBe(true);
      expect(matchesAllowlist('a.b.internal', allowlist)).toBe(true);
    });

    it('should not match bare suffix for wildcard', () => {
      const allowlist = parseSsrfAllowlist('*.internal');
      // "internal" alone should not match "*.internal" (needs the dot)
      expect(matchesAllowlist('internal', allowlist)).toBe(false);
    });

    it('should match wildcard with corp.com', () => {
      const allowlist = parseSsrfAllowlist('*.corp.com');
      expect(matchesAllowlist('api.corp.com', allowlist)).toBe(true);
      expect(matchesAllowlist('deep.nested.corp.com', allowlist)).toBe(true);
      expect(matchesAllowlist('corp.com', allowlist)).toBe(false);
    });

    it('should return false for empty allowlist', () => {
      const allowlist = parseSsrfAllowlist('');
      expect(matchesAllowlist('localhost', allowlist)).toBe(false);
    });
  });

  describe('ipMatchesAllowlist', () => {
    it('should match IP in CIDR range', () => {
      const allowlist = parseSsrfAllowlist('10.0.0.0/8');
      expect(ipMatchesAllowlist('10.1.2.3', allowlist)).toBe(true);
    });

    it('should not match IP outside CIDR range', () => {
      const allowlist = parseSsrfAllowlist('10.0.0.0/8');
      expect(ipMatchesAllowlist('192.168.1.1', allowlist)).toBe(false);
    });

    it('should match against multiple CIDRs', () => {
      const allowlist = parseSsrfAllowlist('10.0.0.0/8,192.168.0.0/16');
      expect(ipMatchesAllowlist('10.1.2.3', allowlist)).toBe(true);
      expect(ipMatchesAllowlist('192.168.1.1', allowlist)).toBe(true);
      expect(ipMatchesAllowlist('172.16.0.1', allowlist)).toBe(false);
    });

    it('should return false for non-IPv4 addresses', () => {
      const allowlist = parseSsrfAllowlist('10.0.0.0/8');
      expect(ipMatchesAllowlist('::1', allowlist)).toBe(false);
      expect(ipMatchesAllowlist('not-an-ip', allowlist)).toBe(false);
    });

    it('should return false for empty allowlist', () => {
      const allowlist = parseSsrfAllowlist('');
      expect(ipMatchesAllowlist('10.0.0.1', allowlist)).toBe(false);
    });
  });

  describe('getAllowlist', () => {
    const originalEnv = process.env.SSRF_ALLOWLIST;

    beforeEach(() => {
      clearAllowlistCache();
      SettingsService.resetInstance();
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SSRF_ALLOWLIST;
      } else {
        process.env.SSRF_ALLOWLIST = originalEnv;
      }
      clearAllowlistCache();
      SettingsService.resetInstance();
    });

    it('should return empty allowlist when env var is not set', () => {
      delete process.env.SSRF_ALLOWLIST;
      const result = getAllowlist();
      expect(result.hostnames).toEqual([]);
      expect(result.patterns).toEqual([]);
      expect(result.cidrs).toEqual([]);
    });

    it('should parse from env var', () => {
      process.env.SSRF_ALLOWLIST = 'localhost,10.0.0.0/8';
      const result = getAllowlist();
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.cidrs).toHaveLength(1);
    });

    it('should cache the result', () => {
      process.env.SSRF_ALLOWLIST = 'localhost';
      const result1 = getAllowlist();
      const result2 = getAllowlist();
      expect(result1).toBe(result2);
    });

    it('should invalidate cache when env var changes', () => {
      process.env.SSRF_ALLOWLIST = 'localhost';
      const result1 = getAllowlist();

      process.env.SSRF_ALLOWLIST = 'localhost,*.internal';
      const result2 = getAllowlist();

      expect(result1).not.toBe(result2);
      expect(result2.patterns).toEqual(['*.internal']);
    });

    it('should invalidate cache when env var is removed', () => {
      process.env.SSRF_ALLOWLIST = 'localhost';
      const result1 = getAllowlist();
      expect(result1.hostnames).toEqual(['localhost']);

      delete process.env.SSRF_ALLOWLIST;
      const result2 = getAllowlist();
      expect(result2.hostnames).toEqual([]);
    });

    it('should prefer SettingsService DB value over env var', () => {
      process.env.SSRF_ALLOWLIST = 'from-env';
      const mockStore = {
        findAll: () => [{ key: 'ssrf_allowlist', value: 'localhost,*.internal', updated_at: '', updated_by: null }],
        upsertMany: jest.fn(),
        findByKey: jest.fn(),
      };
      SettingsService.getInstance(mockStore as any);

      const result = getAllowlist();
      expect(result.hostnames).toEqual(['localhost']);
      expect(result.patterns).toEqual(['*.internal']);
    });

    it('should fall back to env var when SettingsService has no DB value', () => {
      process.env.SSRF_ALLOWLIST = 'from-env';
      const mockStore = {
        findAll: () => [],
        upsertMany: jest.fn(),
        findByKey: jest.fn(),
      };
      SettingsService.getInstance(mockStore as any);

      const result = getAllowlist();
      expect(result.hostnames).toEqual(['from-env']);
    });

    it('should fall back to env var when SettingsService is not initialized', () => {
      process.env.SSRF_ALLOWLIST = 'fallback-host';
      // No SettingsService.getInstance() call — simulates early startup
      const result = getAllowlist();
      expect(result.hostnames).toEqual(['fallback-host']);
    });

    it('should invalidate cache when SettingsService value changes', () => {
      const mockStore = {
        findAll: () => [{ key: 'ssrf_allowlist', value: 'localhost', updated_at: '', updated_by: null }],
        upsertMany: jest.fn().mockReturnValue([]),
        findByKey: jest.fn(),
      };
      const settings = SettingsService.getInstance(mockStore as any);

      const result1 = getAllowlist();
      expect(result1.hostnames).toEqual(['localhost']);

      // Simulate admin updating the setting
      settings.update({ ssrf_allowlist: 'localhost,*.corp.com' }, 'admin-id');
      clearAllowlistCache();

      const result2 = getAllowlist();
      expect(result2.hostnames).toEqual(['localhost']);
      expect(result2.patterns).toEqual(['*.corp.com']);
    });
  });
});
