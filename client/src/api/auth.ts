import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export type AuthMode = 'oidc' | 'local';

export interface AuthModeResponse {
  mode: AuthMode;
}

export interface LocalLoginResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function fetchAuthMode(): Promise<AuthModeResponse> {
  const response = await fetch('/api/auth/mode', { credentials: 'include' });
  return handleResponse<AuthModeResponse>(response);
}

export async function localLogin(
  email: string,
  password: string,
): Promise<LocalLoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  return handleResponse<LocalLoginResponse>(response);
}
