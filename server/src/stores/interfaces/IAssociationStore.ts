import { DependencyAssociation } from '../../db/types';
import {
  AssociationWithService,
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
   * Check if an association exists between a dependency and service
   */
  existsForDependencyAndService(dependencyId: string, linkedServiceId: string): boolean;

  // Auto-suggestion queries
  findAutoSuggested(dependencyId: string): DependencyAssociation[];

  // Write operations
  create(input: AssociationCreateInput): DependencyAssociation;
  delete(id: string): boolean;
  deleteByDependencyId(dependencyId: string): number;

  // Auto-suggestion mutations
  confirm(id: string): boolean;
  dismiss(id: string): boolean;

  // Utility
  exists(id: string): boolean;
  count(options?: AssociationListOptions): number;
}
