import { handleResponse } from './common';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('handleResponse', () => {
  it('returns parsed JSON on success', async () => {
    const data = { id: '1', name: 'Test' };
    const result = await handleResponse(mockResponse(data));
    expect(result).toEqual(data);
  });

  it('throws error with message from response body', async () => {
    await expect(
      handleResponse(mockResponse({ message: 'Not found' }, 404)),
    ).rejects.toThrow('Not found');
  });

  it('throws error with error field from response body', async () => {
    await expect(
      handleResponse(mockResponse({ error: 'Bad request' }, 400)),
    ).rejects.toThrow('Bad request');
  });

  it('throws generic error when response body has no message', async () => {
    await expect(
      handleResponse(mockResponse({}, 500)),
    ).rejects.toThrow('HTTP error 500');
  });

  it('throws fallback error when response body is not JSON', async () => {
    const response = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not JSON')),
    } as Response;

    await expect(handleResponse(response)).rejects.toThrow('Request failed');
  });

  it('dispatches auth:expired event on 401 response', async () => {
    const handler = jest.fn();
    window.addEventListener('auth:expired', handler);

    await expect(
      handleResponse(mockResponse({ error: 'Not authenticated' }, 401)),
    ).rejects.toThrow('Not authenticated');

    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener('auth:expired', handler);
  });

  it('does not dispatch auth:expired event on non-401 errors', async () => {
    const handler = jest.fn();
    window.addEventListener('auth:expired', handler);

    await expect(
      handleResponse(mockResponse({ message: 'Server error' }, 500)),
    ).rejects.toThrow('Server error');

    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', handler);
  });
});
