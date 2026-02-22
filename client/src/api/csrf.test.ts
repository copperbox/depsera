import { getCsrfToken, withCsrfToken } from './csrf';

describe('CSRF utilities', () => {
  beforeEach(() => {
    // Clear cookies
    document.cookie = 'csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  describe('getCsrfToken', () => {
    it('should return token from csrf-token cookie', () => {
      document.cookie = 'csrf-token=test-token-value';
      expect(getCsrfToken()).toBe('test-token-value');
    });

    it('should return empty string when no csrf cookie exists', () => {
      expect(getCsrfToken()).toBe('');
    });

    it('should handle cookie among multiple cookies', () => {
      document.cookie = 'other=value';
      document.cookie = 'csrf-token=my-token';
      document.cookie = 'another=thing';
      expect(getCsrfToken()).toBe('my-token');
    });
  });

  describe('withCsrfToken', () => {
    it('should add CSRF token to headers', () => {
      document.cookie = 'csrf-token=abc123';
      const headers = withCsrfToken({ 'Content-Type': 'application/json' });
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'abc123',
      });
    });

    it('should return headers unchanged when no token', () => {
      const headers = withCsrfToken({ 'Content-Type': 'application/json' });
      expect(headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should work with empty headers', () => {
      document.cookie = 'csrf-token=token123';
      const headers = withCsrfToken();
      expect(headers).toEqual({ 'X-CSRF-Token': 'token123' });
    });
  });
});
