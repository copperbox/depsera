import { DependencyAssociation, AssociationType } from '../../db/types';
import {
  AssociationWithService,
  AssociationWithContext,
  AssociationListOptions,
  AssociationCreateInput,
} from '../types';

/**
 * Store interface for DependencyAssociation entity operations
 */
export interface IAssociationStore {
  // Find operations
  findById(id: string): DependencyAssociation | undefined;
  findByDependencyId(dependencyId: string): DependencyAssociation[];
  findByDependencyIdWithService(dependencyId: string): AssociationWithService[];
  findByLinkedServiceId(linkedServiceId: string): DependencyAssociation[];

  /**
   * Get all pending auto-suggestions (not dismissed)
   * Returns full context including dependency name and both service names
   */
  findPendingSuggestions(): AssociationWithContext[];

  /**
   * Check if an association exists between a dependency and service
   */
  existsForDependencyAndService(dependencyId: string, linkedServiceId: string): boolean;

  // Write operations
  create(input: AssociationCreateInput): DependencyAssociation;
  delete(id: string): boolean;
  deleteByDependencyId(dependencyId: string): number;

  /**
   * Accept an auto-suggestion (converts to manual association)
   */
  acceptSuggestion(id: string): boolean;

  /**
   * Dismiss an auto-suggestion
   */
  dismissSuggestion(id: string): boolean;

  /**
   * Reactivate a dismissed association with a new type
   */
  reactivateDismissed(id: string, associationType: AssociationType): boolean;

  // Utility
  exists(id: string): boolean;
  count(options?: AssociationListOptions): number;
}
