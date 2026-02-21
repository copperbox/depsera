import { fetchSettings, updateSettings } from './settings';

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

describe('settings API', () => {
  describe('fetchSettings', () => {
    it('fetches settings with credentials', async () => {
      const mockData = {
        settings: {
          data_retention_days: { value: 365, source: 'default' },
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockData));

      const result = await fetchSettings();

      expect(mockFetch).toHaveBeenCalledWith('/api/admin/settings', {
        credentials: 'include',
      });
      expect(result).toEqual(mockData);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403));

      await expect(fetchSettings()).rejects.toThrow('Forbidden');
    });
  });

  describe('updateSettings', () => {
    it('sends PUT with CSRF token and JSON body', async () => {
      const updates = { data_retention_days: 90 };
      const mockData = { settings: {}, updated: 1 };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockData));

      const result = await updateSettings(updates);

      expect(mockFetch).toHaveBeenCalledWith('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-csrf-token',
        },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      expect(result).toEqual(mockData);
    });

    it('throws on validation error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'data_retention_days must be between 1 and 3650' }, 400),
      );

      await expect(updateSettings({ data_retention_days: 0 })).rejects.toThrow(
        'data_retention_days must be between 1 and 3650',
      );
    });
  });
});
