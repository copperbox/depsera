/**
 * Generic response handler for fetch requests
 * Handles error extraction and JSON parsing
 * @param response - The fetch Response object
 * @returns Parsed JSON response
 * @throws Error with message from response or default message
 */
export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
  return response.json();
}
