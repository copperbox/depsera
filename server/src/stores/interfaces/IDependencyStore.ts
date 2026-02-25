import { Dependency } from '../../db/types';
import {
  DependencyWithTarget,
  DependencyForWallboard,
  DependencyListOptions,
  DependencyUpsertInput,
  DependencyOverrideInput,
  DependentReport,
} from '../types';

/**
 * Basic dependency info for status change detection
 */
export interface ExistingDependency {
  id: string;
  name: string;
  healthy: number | null;
}

/**
 * Result of an upsert operation
 */
export interface UpsertResult {
  dependency: Dependency;
  isNew: boolean;
  healthChanged: boolean;
  previousHealthy: number | null;
}

/**
 * Store interface for Dependency entity operations
 */
export interface IDependencyStore {
  // Find operations
  findById(id: string): Dependency | undefined;
  findByServiceId(serviceId: string): Dependency[];
  findByServiceIdWithTargets(serviceId: string): DependencyWithTarget[];
  findAll(options?: DependencyListOptions): Dependency[];

  /**
   * Find all dependencies with associations and latency data.
   * Consolidates the complex query used in GraphService.
   */
  findAllWithAssociationsAndLatency(options?: { activeServicesOnly?: boolean }): DependencyWithTarget[];

  /**
   * Find dependencies for specific services with associations and latency.
   * Used for team-scoped graphs.
   */
  findByServiceIdsWithAssociationsAndLatency(serviceIds: string[]): DependencyWithTarget[];

  /**
   * Find all dependencies with team and linked service info for wallboard display.
   */
  findAllForWallboard(): DependencyForWallboard[];

  /**
   * Get existing dependencies for a service (minimal fields for change detection)
   */
  findExistingByServiceId(serviceId: string): ExistingDependency[];

  /**
   * Find reports where other services report on this service's health.
   * Used for aggregated health calculation.
   */
  findDependentReports(serviceId: string): DependentReport[];

  // Write operations
  upsert(input: DependencyUpsertInput): UpsertResult;
  updateOverrides(id: string, overrides: DependencyOverrideInput): Dependency | undefined;
  delete(id: string): boolean;
  deleteByServiceId(serviceId: string): number;

  // Utility
  exists(id: string): boolean;
  count(options?: DependencyListOptions): number;
}
