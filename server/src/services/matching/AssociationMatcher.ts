import db from '../../db';
import { Service, Dependency, DependencyAssociation } from '../../db/types';
import { MatchResult, MatchSuggestion } from './types';
import { MatchingStrategyExecutor } from './MatchingStrategyExecutor';
import { randomUUID } from 'crypto';

/**
 * Smart matching service for auto-suggesting dependency associations.
 * Matches dependencies to services based on naming patterns and endpoint matching.
 */
export class AssociationMatcher {
  private static instance: AssociationMatcher | null = null;
  private strategyExecutor: MatchingStrategyExecutor;

  private constructor() {
    this.strategyExecutor = new MatchingStrategyExecutor();
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
    const services = db.prepare(`
      SELECT * FROM services WHERE is_active = 1
    `).all() as Service[];

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
    const dependency = db.prepare(`
      SELECT * FROM dependencies WHERE id = ?
    `).get(dependencyId) as Dependency | undefined;

    if (!dependency) {
      return [];
    }

    // Get existing associations and dismissed suggestions to exclude
    const existingAssociations = db.prepare(`
      SELECT linked_service_id FROM dependency_associations
      WHERE dependency_id = ?
    `).all(dependencyId) as { linked_service_id: string }[];

    const excludedServiceIds = new Set(existingAssociations.map(a => a.linked_service_id));

    const matches = this.findMatches(dependency);
    const suggestions: MatchSuggestion[] = [];

    for (const match of matches) {
      if (excludedServiceIds.has(match.serviceId)) continue;

      // Check if suggestion already exists
      const existing = db.prepare(`
        SELECT id FROM dependency_associations
        WHERE dependency_id = ? AND linked_service_id = ?
      `).get(dependencyId, match.serviceId) as { id: string } | undefined;

      if (existing) continue;

      // Insert as auto-suggested association (not yet accepted)
      const id = randomUUID();
      db.prepare(`
        INSERT INTO dependency_associations (
          id, dependency_id, linked_service_id, association_type,
          is_auto_suggested, confidence_score, is_dismissed
        ) VALUES (?, ?, ?, ?, 1, ?, 0)
      `).run(
        id,
        dependencyId,
        match.serviceId,
        match.associationType,
        match.confidenceScore
      );

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
    const dependencies = db.prepare(`
      SELECT * FROM dependencies WHERE service_id = ?
    `).all(serviceId) as Dependency[];

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
    return db.prepare(`
      SELECT
        da.*,
        d.name as dependency_name,
        s.name as service_name,
        ls.name as linked_service_name
      FROM dependency_associations da
      JOIN dependencies d ON da.dependency_id = d.id
      JOIN services s ON d.service_id = s.id
      JOIN services ls ON da.linked_service_id = ls.id
      WHERE da.is_auto_suggested = 1
        AND da.is_dismissed = 0
      ORDER BY da.confidence_score DESC
    `).all() as (DependencyAssociation & {
      dependency_name: string;
      service_name: string;
      linked_service_name: string;
    })[];
  }

  /**
   * Accept a suggestion (convert to manual association)
   */
  acceptSuggestion(suggestionId: string): boolean {
    const result = db.prepare(`
      UPDATE dependency_associations
      SET is_auto_suggested = 0
      WHERE id = ? AND is_auto_suggested = 1
    `).run(suggestionId);

    return result.changes > 0;
  }

  /**
   * Dismiss a suggestion
   */
  dismissSuggestion(suggestionId: string): boolean {
    const result = db.prepare(`
      UPDATE dependency_associations
      SET is_dismissed = 1
      WHERE id = ? AND is_auto_suggested = 1
    `).run(suggestionId);

    return result.changes > 0;
  }
}
