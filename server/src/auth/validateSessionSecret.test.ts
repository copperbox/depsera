import { validateSessionSecret } from './validateSessionSecret';

describe('validateSessionSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should throw if SESSION_SECRET is missing', () => {
      delete process.env.SESSION_SECRET;
      expect(() => validateSessionSecret()).toThrow(
        'SESSION_SECRET environment variable is required in production'
      );
    });

    it('should throw if SESSION_SECRET is a known weak default', () => {
      const weakDefaults = [
        'dev-secret-change-in-production',
        'dev-session-secret-change-in-production',
        'change-me-to-random-32-char-string',
      ];

      for (const weak of weakDefaults) {
        process.env.SESSION_SECRET = weak;
        expect(() => validateSessionSecret()).toThrow(
          'SESSION_SECRET must not be a known default value in production'
        );
      }
    });

    it('should throw if SESSION_SECRET is too short', () => {
      process.env.SESSION_SECRET = 'short-but-unique-secret';
      expect(() => validateSessionSecret()).toThrow(
        'SESSION_SECRET must be at least 32 characters in production'
      );
    });

    it('should return valid secret in production', () => {
      process.env.SESSION_SECRET = 'a-very-long-and-secure-random-secret-value-here';
      expect(validateSessionSecret()).toBe(
        'a-very-long-and-secure-random-secret-value-here'
      );
    });
  });

  describe('development mode', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
    });

    it('should return fallback when SESSION_SECRET is missing', () => {
      delete process.env.SESSION_SECRET;
      expect(validateSessionSecret()).toBe('dev-secret-change-in-production');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Using default session secret')
      );
    });

    it('should warn when SESSION_SECRET is a weak default', () => {
      process.env.SESSION_SECRET = 'dev-session-secret-change-in-production';
      expect(validateSessionSecret()).toBe('dev-session-secret-change-in-production');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('known weak default')
      );
    });

    it('should return custom secret without warning', () => {
      process.env.SESSION_SECRET = 'my-custom-dev-secret';
      expect(validateSessionSecret()).toBe('my-custom-dev-secret');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should allow short secrets in development', () => {
      process.env.SESSION_SECRET = 'short';
      expect(validateSessionSecret()).toBe('short');
    });
  });
});
