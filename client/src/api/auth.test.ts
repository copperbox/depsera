import { fetchAuthMode, localLogin } from './auth';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('auth API', () => {
  describe('fetchAuthMode', () => {
    it('fetches auth mode with credentials', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ mode: 'local' }));

      const result = await fetchAuthMode();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/mode', {
        credentials: 'include',
      });
      expect(result).toEqual({ mode: 'local' });
    });

    it('returns oidc mode', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ mode: 'oidc' }));

      const result = await fetchAuthMode();

      expect(result).toEqual({ mode: 'oidc' });
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Server error' }, 500));

      await expect(fetchAuthMode()).rejects.toThrow('Server error');
    });
  });

  describe('localLogin', () => {
    it('sends POST with credentials and CSRF token', async () => {
      const mockUser = { id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin' };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUser));

      const result = await localLogin('admin@test.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-csrf-token',
        },
        body: JSON.stringify({ email: 'admin@test.com', password: 'password123' }),
        credentials: 'include',
      });
      expect(result).toEqual(mockUser);
    });

    it('throws on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Invalid email or password' }, 401),
      );

      await expect(localLogin('bad@test.com', 'wrong')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('throws on missing fields', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Email and password are required' }, 400),
      );

      await expect(localLogin('', '')).rejects.toThrow(
        'Email and password are required',
      );
    });
  });
});
