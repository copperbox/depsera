import { validateRedirectUrl } from './redirect';

// Mock window.location.origin
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    origin: 'http://localhost:3000',
    href: '',
    pathname: '/',
  },
  writable: true,
});

describe('validateRedirectUrl', () => {
  describe('relative paths', () => {
    it('should allow relative paths starting with /', () => {
      expect(validateRedirectUrl('/login')).toBe('/login');
      expect(validateRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(validateRedirectUrl('/some/deep/path')).toBe('/some/deep/path');
    });

    it('should block protocol-relative URLs', () => {
      expect(validateRedirectUrl('//evil.com')).toBe('/login');
      expect(validateRedirectUrl('//evil.com/path')).toBe('/login');
    });
  });

  describe('same-origin URLs', () => {
    it('should allow same-origin absolute URLs', () => {
      expect(validateRedirectUrl('http://localhost:3000/dashboard')).toBe(
        'http://localhost:3000/dashboard'
      );
      expect(validateRedirectUrl('http://localhost:3000/login')).toBe(
        'http://localhost:3000/login'
      );
    });
  });

  describe('external URLs', () => {
    it('should allow external HTTPS URLs (OIDC logout)', () => {
      expect(validateRedirectUrl('https://auth.example.com/logout')).toBe(
        'https://auth.example.com/logout'
      );
      expect(validateRedirectUrl('https://idp.company.com/v2/logout?returnTo=http://localhost:3000')).toBe(
        'https://idp.company.com/v2/logout?returnTo=http://localhost:3000'
      );
    });

    it('should block external HTTP URLs', () => {
      expect(validateRedirectUrl('http://evil.com/phish')).toBe('/login');
      expect(validateRedirectUrl('http://192.168.1.1/admin')).toBe('/login');
    });
  });

  describe('dangerous schemes', () => {
    it('should block javascript: URLs', () => {
      expect(validateRedirectUrl('javascript:alert(1)')).toBe('/login');
    });

    it('should block data: URLs', () => {
      expect(validateRedirectUrl('data:text/html,<script>alert(1)</script>')).toBe('/login');
    });

    it('should block vbscript: URLs', () => {
      expect(validateRedirectUrl('vbscript:msgbox')).toBe('/login');
    });
  });

  describe('edge cases', () => {
    it('should return /login for empty string', () => {
      expect(validateRedirectUrl('')).toBe('/login');
    });

    it('should return /login for null/undefined', () => {
      expect(validateRedirectUrl(null as unknown as string)).toBe('/login');
      expect(validateRedirectUrl(undefined as unknown as string)).toBe('/login');
    });

    it('should return /login for invalid URLs', () => {
      expect(validateRedirectUrl('not-a-url')).toBe('/login');
      expect(validateRedirectUrl('://broken')).toBe('/login');
    });

    it('should trim whitespace', () => {
      expect(validateRedirectUrl('  /login  ')).toBe('/login');
    });
  });
});
