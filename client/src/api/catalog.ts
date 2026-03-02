import type { ExternalDependencyEntry } from '../types/catalog';
import { handleResponse } from './common';

export async function fetchExternalDependencies(): Promise<
  ExternalDependencyEntry[]
> {
  const response = await fetch('/api/catalog/external-dependencies', {
    credentials: 'include',
  });
  return handleResponse<ExternalDependencyEntry[]>(response);
}
