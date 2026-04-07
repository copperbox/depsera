import { TeamApiKey, CreateTeamApiKeyInput } from '../../db/types';

export interface ITeamApiKeyStore {
  findByTeamId(teamId: string): TeamApiKey[];
  findByKeyHash(hash: string): TeamApiKey | undefined;
  findById(id: string): TeamApiKey | undefined;
  create(input: CreateTeamApiKeyInput): TeamApiKey & { rawKey: string };
  delete(id: string): boolean;
  updateLastUsed(id: string): void;
  updateRateLimit(id: string, rateLimit: number | null): TeamApiKey;
  setAdminLock(id: string, locked: boolean, rateLimit?: number | null): TeamApiKey;
}
