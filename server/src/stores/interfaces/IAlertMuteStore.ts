import { AlertMute } from '../../db/types';

export interface IAlertMuteStore {
  findById(id: string): AlertMute | undefined;
  findByTeamId(teamId: string, options?: { limit?: number; offset?: number }): AlertMute[];
  countByTeamId(teamId: string): number;
  findAll(options?: { limit?: number; offset?: number; teamId?: string }): AlertMute[];
  countAll(teamId?: string): number;
  isEffectivelyMuted(dependencyId: string, teamId: string, canonicalName?: string | null): boolean;
  isServiceMuted(serviceId: string, teamId: string): boolean;
  create(input: Omit<AlertMute, 'id' | 'created_at'>): AlertMute;
  delete(id: string): boolean;
  deleteExpired(): number;
}
