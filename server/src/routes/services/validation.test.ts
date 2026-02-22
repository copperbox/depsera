import { isValidUrl, MIN_POLLING_INTERVAL, DEFAULT_POLLING_INTERVAL } from './validation';

describe('Service validation utilities', () => {
  describe('isValidUrl', () => {
    it('should accept valid http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('http://192.168.1.1/health')).toBe(true);
    });

    it('should accept valid https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://api.example.com/health')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have correct polling interval values', () => {
      expect(MIN_POLLING_INTERVAL).toBe(10);
      expect(DEFAULT_POLLING_INTERVAL).toBe(30);
    });
  });
});
