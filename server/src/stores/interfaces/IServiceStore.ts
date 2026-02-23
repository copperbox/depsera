import { Service } from '../../db/types';
import {
  ServiceWithTeam,
  ServiceListOptions,
  ServiceCreateInput,
  ServiceUpdateInput,
} from '../types';

/**
 * Store interface for Service entity operations
 */
export interface IServiceStore {
  // Find operations
  findById(id: string): Service | undefined;
  findByIdWithTeam(id: string): ServiceWithTeam | undefined;
  findAll(options?: ServiceListOptions): Service[];
  findAllWithTeam(options?: ServiceListOptions): ServiceWithTeam[];
  findActive(): Service[];
  findActiveWithTeam(): ServiceWithTeam[];
  findByTeamId(teamId: string): Service[];

  // Write operations
  create(input: ServiceCreateInput): Service;
  update(id: string, input: ServiceUpdateInput): Service | undefined;
  delete(id: string): boolean;

  // Poll result tracking
  updatePollResult(serviceId: string, success: boolean, error?: string): void;

  // Utility
  exists(id: string): boolean;
  count(options?: ServiceListOptions): number;
}
