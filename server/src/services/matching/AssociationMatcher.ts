import { getStores, StoreRegistry } from '../../stores';
import type {
  IDependencyStore,
  IAssociationStore,
  IServiceStore,
} from '../../stores/interfaces';
import { Dependency, DependencyAssociation } from '../../db/types';
import { MatchResult, MatchSuggestion } from './types';
import { MatchingStrategyExecutor } from './MatchingStrategyExecutor';

/**
 * Smart matching service for auto-suggesting dependency associations.
 * Matches dependencies to services based on naming patterns and endpoint matching.
 */
export class AssociationMatcher {
  private static instance: AssociationMatcher | null = null;
  private strategyExecutor: MatchingStrategyExecutor;
  private serviceStore: IServiceStore;
  private dependencyStore: IDependencyStore;
  private associationStore: IAssociationStore;

  private constructor(stores?: StoreRegistry) {
    const storeRegistry = stores || getStores();
    this.strategyExecutor = new MatchingStrategyExecutor();
    this.serviceStore = storeRegistry.services;
    this.dependencyStore = storeRegistry.dependencies;
    this.associationStore = storeRegistry.associations;
  }

  static getInstance(): AssociationMatcher {
    if (!AssociationMatcher.instance) {
      AssociationMatcher.instance = new AssociationMatcher();
    }
    return AssociationMatcher.instance;
  }

  // For testing - reset the singleton
  static resetInstance(): void {
    AssociationMatcher.instance = null;
  }

  /**
   * Find potential service matches for a dependency
   */
  findMatches(dependency: Dependency, excludeServiceId?: string): MatchResult[] {
    const services = this.serviceStore.findAll({ isActive: true });

    const excludeIds = new Set<string>();
    if (excludeServiceId) {
      excludeIds.add(excludeServiceId);
    }

    const matches = this.strategyExecutor.findAllMatches(dependency, services, excludeIds);

    return matches.map(match => ({
      serviceId: match.serviceId,
      serviceName: match.serviceName,
      associationType: match.result.associationType,
      confidenceScore: match.result.score,
      matchReason: match.result.reason,
    }));
  }

  /**
   * Generate and store suggestions for a dependency
   */
  generateSuggestions(dependencyId: string): MatchSuggestion[] {
    const dependency = this.dependencyStore.findById(dependencyId);

    if (!dependency) {
      return [];
    }

    // Get existing associations to exclude
    const existingAssociations = this.associationStore.findByDependencyId(dependencyId);
    const excludedServiceIds = new Set(existingAssociations.map(a => a.linked_service_id));

    const matches = this.findMatches(dependency);
    const suggestions: MatchSuggestion[] = [];

    for (const match of matches) {
      if (excludedServiceIds.has(match.serviceId)) continue;

      // Check if suggestion already exists
      if (this.associationStore.existsForDependencyAndService(dependencyId, match.serviceId)) {
        continue;
      }

      // Insert as auto-suggested association (not yet accepted)
      this.associationStore.create({
        dependency_id: dependencyId,
        linked_service_id: match.serviceId,
        association_type: match.associationType,
        is_auto_suggested: true,
        confidence_score: match.confidenceScore,
      });

      suggestions.push({
        dependencyId,
        dependencyName: dependency.name,
        serviceId: match.serviceId,
        serviceName: match.serviceName,
        associationType: match.associationType,
        confidenceScore: match.confidenceScore,
        matchReason: match.matchReason,
      });
    }

    return suggestions;
  }

  /**
   * Generate suggestions for all dependencies of a service
   */
  generateSuggestionsForService(serviceId: string): MatchSuggestion[] {
    const dependencies = this.dependencyStore.findByServiceId(serviceId);

    const allSuggestions: MatchSuggestion[] = [];

    for (const dep of dependencies) {
      const suggestions = this.generateSuggestions(dep.id);
      allSuggestions.push(...suggestions);
    }

    return allSuggestions;
  }

  /**
   * Get all pending suggestions (not dismissed, is_auto_suggested)
   */
  getPendingSuggestions(): (DependencyAssociation & {
    dependency_name: string;
    service_name: string;
    linked_service_name: string;
  })[] {
    return this.associationStore.findPendingSuggestions();
  }

  /**
   * Accept a suggestion (convert to manual association)
   */
  acceptSuggestion(suggestionId: string): boolean {
    return this.associationStore.acceptSuggestion(suggestionId);
  }

  /**
   * Dismiss a suggestion
   */
  dismissSuggestion(suggestionId: string): boolean {
    return this.associationStore.dismissSuggestion(suggestionId);
  }
}
