import { TeamApiKey, CreateTeamApiKeyInput } from '../../db/types';

export interface ITeamApiKeyStore {
  findByTeamId(teamId: string): TeamApiKey[];
  findByKeyHash(hash: string): TeamApiKey | undefined;
  create(input: CreateTeamApiKeyInput): TeamApiKey & { rawKey: string };
  delete(id: string): boolean;
  updateLastUsed(id: string): void;
}
