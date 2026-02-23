import type { WallboardResponse } from '../types/wallboard';
import { handleResponse } from './common';

export async function fetchWallboardData(): Promise<WallboardResponse> {
  const response = await fetch('/api/wallboard', { credentials: 'include' });
  return handleResponse<WallboardResponse>(response);
}
