import {
  getManifestConfig,
  saveManifestConfig,
  removeManifestConfig,
  triggerSync,
  getSyncHistory,
  validateManifest,
  getDriftFlags,
  getDriftSummary,
  acceptDrift,
  dismissDrift,
  reopenDrift,
  bulkAcceptDrifts,
  bulkDismissDrifts,
} from './manifest';

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

// --- Configuration ---

describe('getManifestConfig', () => {
  it('fetches manifest config for a team', async () => {
    const config = { id: 'c1', team_id: 't1', manifest_url: 'https://example.com/manifest.json' };
    mockFetch.mockResolvedValue(jsonResponse({ config }));

    const result = await getManifestConfig('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest', { credentials: 'include' });
    expect(result).toEqual(config);
  });

  it('returns null when no config exists', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ config: null }));

    const result = await getManifestConfig('t1');

    expect(result).toBeNull();
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(getManifestConfig('t1')).rejects.toThrow('Not found');
  });
});

describe('saveManifestConfig', () => {
  it('saves manifest config', async () => {
    const input = { manifest_url: 'https://example.com/manifest.json' };
    const config = { id: 'c1', team_id: 't1', ...input };
    mockFetch.mockResolvedValue(jsonResponse({ config }));

    const result = await saveManifestConfig('t1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(config);
  });

  it('saves config with sync policy', async () => {
    const input = {
      manifest_url: 'https://example.com/manifest.json',
      sync_policy: { on_field_drift: 'manifest_wins' as const },
    };
    const config = { id: 'c1', team_id: 't1', manifest_url: input.manifest_url };
    mockFetch.mockResolvedValue(jsonResponse({ config }));

    await saveManifestConfig('t1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'SSRF blocked' }, 400));

    await expect(
      saveManifestConfig('t1', { manifest_url: 'http://localhost' })
    ).rejects.toThrow('SSRF blocked');
  });
});

describe('removeManifestConfig', () => {
  it('removes manifest config', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await removeManifestConfig('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Config not found' }),
    });

    await expect(removeManifestConfig('t1')).rejects.toThrow('Config not found');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(removeManifestConfig('t1')).rejects.toThrow('Delete failed');
  });
});

// --- Sync ---

describe('triggerSync', () => {
  it('triggers manual sync', async () => {
    const syncResult = { status: 'success', summary: {}, errors: [], warnings: [], changes: [], duration_ms: 500 };
    mockFetch.mockResolvedValue(jsonResponse({ result: syncResult }));

    const result = await triggerSync('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest/sync', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(syncResult);
  });

  it('throws on 409 conflict', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Sync already in progress' }, 409));

    await expect(triggerSync('t1')).rejects.toThrow('Sync already in progress');
  });

  it('throws on 429 cooldown', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Please wait before syncing again' }, 429));

    await expect(triggerSync('t1')).rejects.toThrow('Please wait before syncing again');
  });
});

describe('getSyncHistory', () => {
  it('fetches sync history with defaults', async () => {
    const data = { history: [], total: 0 };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await getSyncHistory('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/manifest/sync-history', {
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('fetches sync history with pagination', async () => {
    const data = { history: [{ id: 'h1' }], total: 5 };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await getSyncHistory('t1', { limit: 10, offset: 20 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/manifest/sync-history?limit=10&offset=20',
      { credentials: 'include' }
    );
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(getSyncHistory('t1')).rejects.toThrow('Server error');
  });
});

// --- Validation ---

describe('validateManifest', () => {
  it('validates manifest JSON', async () => {
    const validationResult = { valid: true, version: 1, service_count: 2, valid_count: 2, errors: [], warnings: [] };
    mockFetch.mockResolvedValue(jsonResponse({ result: validationResult }));

    const manifest = { version: 1, services: [] };
    const result = await validateManifest(manifest);

    expect(mockFetch).toHaveBeenCalledWith('/api/manifest/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(manifest),
      credentials: 'include',
    });
    expect(result).toEqual(validationResult);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Invalid body' }, 400));

    await expect(validateManifest(null)).rejects.toThrow('Invalid body');
  });
});

// --- Drift flags ---

describe('getDriftFlags', () => {
  it('fetches drift flags with defaults', async () => {
    const data = { flags: [], summary: { pending_count: 0, dismissed_count: 0, field_change_pending: 0, service_removal_pending: 0 }, total: 0 };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await getDriftFlags('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('fetches drift flags with filters', async () => {
    const data = { flags: [], summary: { pending_count: 0, dismissed_count: 0, field_change_pending: 0, service_removal_pending: 0 }, total: 0 };
    mockFetch.mockResolvedValue(jsonResponse(data));

    await getDriftFlags('t1', { status: 'dismissed', drift_type: 'field_change', service_id: 's1', limit: 10, offset: 5 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/drifts?status=dismissed&drift_type=field_change&service_id=s1&limit=10&offset=5',
      { credentials: 'include' }
    );
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(getDriftFlags('t1')).rejects.toThrow('Server error');
  });
});

describe('getDriftSummary', () => {
  it('fetches drift summary', async () => {
    const summary = { pending_count: 3, dismissed_count: 1, field_change_pending: 2, service_removal_pending: 1 };
    mockFetch.mockResolvedValue(jsonResponse({ summary }));

    const result = await getDriftSummary('t1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/summary', { credentials: 'include' });
    expect(result).toEqual(summary);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403));

    await expect(getDriftSummary('t1')).rejects.toThrow('Forbidden');
  });
});

describe('acceptDrift', () => {
  it('accepts a drift flag', async () => {
    const flag = { id: 'd1', status: 'accepted' };
    mockFetch.mockResolvedValue(jsonResponse({ flag }));

    const result = await acceptDrift('t1', 'd1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/d1/accept', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(flag);
  });

  it('throws on 409 conflict', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Flag is already accepted or resolved' }, 409));

    await expect(acceptDrift('t1', 'd1')).rejects.toThrow('Flag is already accepted or resolved');
  });
});

describe('dismissDrift', () => {
  it('dismisses a drift flag', async () => {
    const flag = { id: 'd1', status: 'dismissed' };
    mockFetch.mockResolvedValue(jsonResponse({ flag }));

    const result = await dismissDrift('t1', 'd1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/d1/dismiss', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(flag);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(dismissDrift('t1', 'd1')).rejects.toThrow('Not found');
  });
});

describe('reopenDrift', () => {
  it('reopens a dismissed drift flag', async () => {
    const flag = { id: 'd1', status: 'pending' };
    mockFetch.mockResolvedValue(jsonResponse({ flag }));

    const result = await reopenDrift('t1', 'd1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/d1/reopen', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(flag);
  });

  it('throws on 400 for non-dismissed flag', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Only dismissed flags can be reopened' }, 400));

    await expect(reopenDrift('t1', 'd1')).rejects.toThrow('Only dismissed flags can be reopened');
  });
});

describe('bulkAcceptDrifts', () => {
  it('bulk accepts drift flags', async () => {
    const result = { succeeded: 2, failed: 0, errors: [] };
    mockFetch.mockResolvedValue(jsonResponse({ result }));

    const response = await bulkAcceptDrifts('t1', ['d1', 'd2']);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/bulk-accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ flag_ids: ['d1', 'd2'] }),
      credentials: 'include',
    });
    expect(response).toEqual(result);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Validation error' }, 400));

    await expect(bulkAcceptDrifts('t1', [])).rejects.toThrow('Validation error');
  });
});

describe('bulkDismissDrifts', () => {
  it('bulk dismisses drift flags', async () => {
    const result = { succeeded: 3, failed: 0, errors: [] };
    mockFetch.mockResolvedValue(jsonResponse({ result }));

    const response = await bulkDismissDrifts('t1', ['d1', 'd2', 'd3']);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/drifts/bulk-dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ flag_ids: ['d1', 'd2', 'd3'] }),
      credentials: 'include',
    });
    expect(response).toEqual(result);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(bulkDismissDrifts('t1', ['d1'])).rejects.toThrow('Server error');
  });
});
