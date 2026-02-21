// Mock openid-client before importing the module
const mockDiscovery = jest.fn();
const mockRandomPKCECodeVerifier = jest.fn();
const mockCalculatePKCECodeChallenge = jest.fn();
const mockRandomState = jest.fn();
const mockServerMetadata = jest.fn();

jest.mock('openid-client', () => ({
  discovery: mockDiscovery,
  randomPKCECodeVerifier: mockRandomPKCECodeVerifier,
  calculatePKCECodeChallenge: mockCalculatePKCECodeChallenge,
  randomState: mockRandomState,
}));

// Store original env values
const originalEnv = { ...process.env };

describe('Auth Config', () => {
  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
    // Reset mocks
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('initializeOIDC', () => {
    it('should throw error when OIDC_ISSUER_URL is missing', async () => {
      delete process.env.OIDC_ISSUER_URL;
      process.env.OIDC_CLIENT_ID = 'test-client';
      process.env.OIDC_CLIENT_SECRET = 'test-secret';

      const { initializeOIDC } = await import('./config');

      await expect(initializeOIDC()).rejects.toThrow(
        'OIDC_ISSUER_URL is required when OIDC mode is active'
      );
    });

    it('should throw error when OIDC_CLIENT_ID is missing', async () => {
      process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
      delete process.env.OIDC_CLIENT_ID;
      process.env.OIDC_CLIENT_SECRET = 'test-secret';

      const { initializeOIDC } = await import('./config');

      await expect(initializeOIDC()).rejects.toThrow(
        'OIDC_CLIENT_ID is required'
      );
    });

    it('should throw error when OIDC_CLIENT_SECRET is missing', async () => {
      process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
      process.env.OIDC_CLIENT_ID = 'test-client';
      delete process.env.OIDC_CLIENT_SECRET;

      const { initializeOIDC } = await import('./config');

      await expect(initializeOIDC()).rejects.toThrow(
        'OIDC_CLIENT_SECRET is required'
      );
    });

    it('should discover OIDC issuer when all env vars present', async () => {
      process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
      process.env.OIDC_CLIENT_ID = 'test-client';
      process.env.OIDC_CLIENT_SECRET = 'test-secret';

      mockServerMetadata.mockReturnValue({ issuer: 'https://issuer.example.com' });
      const mockConfig = { serverMetadata: mockServerMetadata };
      mockDiscovery.mockResolvedValue(mockConfig);

      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const { initializeOIDC } = await import('./config');

      await initializeOIDC();

      expect(mockDiscovery).toHaveBeenCalledWith(
        new URL('https://issuer.example.com'),
        'test-client',
        'test-secret'
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Discovering OIDC issuer')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('OIDC issuer discovered')
      );

      logSpy.mockRestore();
    });

    it('should only initialize once (idempotent)', async () => {
      process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
      process.env.OIDC_CLIENT_ID = 'test-client';
      process.env.OIDC_CLIENT_SECRET = 'test-secret';

      mockServerMetadata.mockReturnValue({ issuer: 'https://issuer.example.com' });
      const mockConfig = { serverMetadata: mockServerMetadata };
      mockDiscovery.mockResolvedValue(mockConfig);

      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const { initializeOIDC } = await import('./config');

      await initializeOIDC();
      await initializeOIDC();

      // Discovery should only be called once
      expect(mockDiscovery).toHaveBeenCalledTimes(1);

      logSpy.mockRestore();
    });
  });

  describe('getOIDCConfig', () => {
    it('should throw error when OIDC not initialized', async () => {
      const { getOIDCConfig } = await import('./config');

      expect(() => getOIDCConfig()).toThrow(
        'OIDC not initialized. Call initializeOIDC() first.'
      );
    });

    it('should return config after initialization', async () => {
      process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
      process.env.OIDC_CLIENT_ID = 'test-client';
      process.env.OIDC_CLIENT_SECRET = 'test-secret';

      mockServerMetadata.mockReturnValue({ issuer: 'https://issuer.example.com' });
      const mockConfig = { serverMetadata: mockServerMetadata };
      mockDiscovery.mockResolvedValue(mockConfig);

      jest.spyOn(console, 'log').mockImplementation();

      const { initializeOIDC, getOIDCConfig } = await import('./config');

      await initializeOIDC();
      const config = getOIDCConfig();

      expect(config).toBe(mockConfig);
    });
  });

  describe('generateCodeVerifier', () => {
    it('should call randomPKCECodeVerifier', async () => {
      mockRandomPKCECodeVerifier.mockReturnValue('test-verifier');

      const { generateCodeVerifier } = await import('./config');
      const result = generateCodeVerifier();

      expect(mockRandomPKCECodeVerifier).toHaveBeenCalled();
      expect(result).toBe('test-verifier');
    });
  });

  describe('generateCodeChallenge', () => {
    it('should call calculatePKCECodeChallenge', async () => {
      mockCalculatePKCECodeChallenge.mockResolvedValue('test-challenge');

      const { generateCodeChallenge } = await import('./config');
      const result = await generateCodeChallenge('test-verifier');

      expect(mockCalculatePKCECodeChallenge).toHaveBeenCalledWith('test-verifier');
      expect(result).toBe('test-challenge');
    });
  });

  describe('generateState', () => {
    it('should call randomState', async () => {
      mockRandomState.mockReturnValue('test-state');

      const { generateState } = await import('./config');
      const result = generateState();

      expect(mockRandomState).toHaveBeenCalled();
      expect(result).toBe('test-state');
    });
  });
});
