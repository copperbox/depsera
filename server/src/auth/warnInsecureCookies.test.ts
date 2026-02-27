import { warnInsecureCookies } from './session';

describe('warnInsecureCookies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should not warn in development mode (NODE_ENV=development)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.REQUIRE_HTTPS;
    delete process.env.TRUST_PROXY;

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should not warn when NODE_ENV is unset (defaults to dev)', () => {
    delete process.env.NODE_ENV;
    delete process.env.REQUIRE_HTTPS;
    delete process.env.TRUST_PROXY;

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should warn in production without HTTPS or trust proxy', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_HTTPS;
    delete process.env.TRUST_PROXY;

    warnInsecureCookies();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Session cookie "secure" flag will be false')
    );
  });

  it('should warn in staging without HTTPS or trust proxy', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.REQUIRE_HTTPS;
    delete process.env.TRUST_PROXY;

    warnInsecureCookies();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cookies will be sent over HTTP')
    );
  });

  it('should not warn in production with REQUIRE_HTTPS=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_HTTPS = 'true';
    delete process.env.TRUST_PROXY;

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should not warn in production with TRUST_PROXY set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_HTTPS;
    process.env.TRUST_PROXY = 'loopback';

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should not warn in production with both REQUIRE_HTTPS and TRUST_PROXY', () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_HTTPS = 'true';
    process.env.TRUST_PROXY = '1';

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should not warn in production with ENABLE_HTTPS=true', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_HTTPS;
    delete process.env.TRUST_PROXY;
    process.env.ENABLE_HTTPS = 'true';

    warnInsecureCookies();

    expect(console.warn).not.toHaveBeenCalled();
  });
});
