import { Database } from 'better-sqlite3';
import { db as defaultDb } from '../db';

// Import interfaces
import type { IServiceStore } from './interfaces/IServiceStore';
import type { ITeamStore } from './interfaces/ITeamStore';
import type { IUserStore } from './interfaces/IUserStore';
import type { IDependencyStore } from './interfaces/IDependencyStore';
import type { IAssociationStore } from './interfaces/IAssociationStore';
import type { ILatencyHistoryStore } from './interfaces/ILatencyHistoryStore';
import type { IErrorHistoryStore } from './interfaces/IErrorHistoryStore';
import type { IDependencyAliasStore } from './interfaces/IDependencyAliasStore';
import type { IAuditLogStore } from './interfaces/IAuditLogStore';
import type { ISettingsStore } from './interfaces/ISettingsStore';

// Import implementations
import { ServiceStore } from './impl/ServiceStore';
import { TeamStore } from './impl/TeamStore';
import { UserStore } from './impl/UserStore';
import { DependencyStore } from './impl/DependencyStore';
import { AssociationStore } from './impl/AssociationStore';
import { LatencyHistoryStore } from './impl/LatencyHistoryStore';
import { ErrorHistoryStore } from './impl/ErrorHistoryStore';
import { DependencyAliasStore } from './impl/DependencyAliasStore';
import { AuditLogStore } from './impl/AuditLogStore';
import { SettingsStore } from './impl/SettingsStore';

/**
 * Central registry providing access to all stores.
 * Supports both singleton access (production) and scoped creation (testing/transactions).
 */
export class StoreRegistry {
  private static instance: StoreRegistry | null = null;

  public readonly services: IServiceStore;
  public readonly teams: ITeamStore;
  public readonly users: IUserStore;
  public readonly dependencies: IDependencyStore;
  public readonly associations: IAssociationStore;
  public readonly latencyHistory: ILatencyHistoryStore;
  public readonly errorHistory: IErrorHistoryStore;
  public readonly aliases: IDependencyAliasStore;
  public readonly auditLog: IAuditLogStore;
  public readonly settings: ISettingsStore;

  private constructor(database: Database) {
    this.services = new ServiceStore(database);
    this.teams = new TeamStore(database);
    this.users = new UserStore(database);
    this.dependencies = new DependencyStore(database);
    this.associations = new AssociationStore(database);
    this.latencyHistory = new LatencyHistoryStore(database);
    this.errorHistory = new ErrorHistoryStore(database);
    this.aliases = new DependencyAliasStore(database);
    this.auditLog = new AuditLogStore(database);
    this.settings = new SettingsStore(database);
  }

  /**
   * Get the singleton instance using the default database.
   * Use this for normal production code.
   */
  static getInstance(): StoreRegistry {
    if (!StoreRegistry.instance) {
      StoreRegistry.instance = new StoreRegistry(defaultDb);
    }
    return StoreRegistry.instance;
  }

  /**
   * Create a new registry instance with a specific database.
   * Use this for transactions or testing with isolated databases.
   */
  static create(database: Database): StoreRegistry {
    return new StoreRegistry(database);
  }

  /**
   * Reset the singleton instance.
   * Primarily for testing purposes.
   */
  static resetInstance(): void {
    StoreRegistry.instance = null;
  }
}

/**
 * Convenience function to get the store registry singleton.
 * Equivalent to StoreRegistry.getInstance().
 *
 * @example
 * ```typescript
 * import { getStores } from '../stores';
 *
 * const stores = getStores();
 * const service = stores.services.findById(id);
 * ```
 */
export function getStores(): StoreRegistry {
  return StoreRegistry.getInstance();
}

// Re-export types
export * from './types';
export * from './interfaces';

// Re-export transaction helper
export { withTransaction, withTransactionAsync } from './transaction';
