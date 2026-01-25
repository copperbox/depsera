import db from '../../db';
import { Service, Dependency, AssociationType, DependencyAssociation } from '../../db/types';
import { MatchResult, MatchSuggestion } from './types';
import { randomUUID } from 'crypto';

/**
 * Smart matching service for auto-suggesting dependency associations.
 * Matches dependencies to services based on naming patterns and endpoint matching.
 */
export class AssociationMatcher {
  private static instance: AssociationMatcher | null = null;

  private constructor() {}

  static getInstance(): AssociationMatcher {
    if (!AssociationMatcher.instance) {
      AssociationMatcher.instance = new AssociationMatcher();
    }
    return AssociationMatcher.instance;
  }

  /**
   * Find potential service matches for a dependency
   */
  findMatches(dependency: Dependency, excludeServiceId?: string): MatchResult[] {
    const services = db.prepare(`
      SELECT * FROM services WHERE is_active = 1
    `).all() as Service[];

    const results: MatchResult[] = [];

    for (const service of services) {
      // Skip the service that owns this dependency
      if (service.id === dependency.service_id) continue;
      // Skip if explicitly excluded
      if (excludeServiceId && service.id === excludeServiceId) continue;

      const match = this.calculateMatch(dependency, service);
      if (match && match.confidenceScore >= 50) {
        results.push(match);
      }
    }

    // Sort by confidence score descending
    return results.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Calculate match between a dependency and a service
   */
  private calculateMatch(dependency: Dependency, service: Service): MatchResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();
    const serviceEndpoint = service.health_endpoint.toLowerCase();

    let bestScore = 0;
    let bestReason = '';
    let associationType: AssociationType = 'other';

    // Strategy 1: Exact name match (100% confidence)
    if (depName === serviceName) {
      return {
        serviceId: service.id,
        serviceName: service.name,
        associationType: this.inferAssociationType(dependency.name),
        confidenceScore: 100,
        matchReason: 'Exact name match',
      };
    }

    // Strategy 2: Service name contains dependency name or vice versa (80% confidence)
    if (serviceName.includes(depName) || depName.includes(serviceName)) {
      const score = 80;
      if (score > bestScore) {
        bestScore = score;
        bestReason = 'Name contains match';
        associationType = this.inferAssociationType(dependency.name);
      }
    }

    // Strategy 3: URL hostname matching (90% confidence)
    const depHostname = this.extractHostname(dependency.name);
    const serviceHostname = this.extractHostname(serviceEndpoint);
    if (depHostname && serviceHostname && depHostname === serviceHostname) {
      const score = 90;
      if (score > bestScore) {
        bestScore = score;
        bestReason = 'Hostname match';
        associationType = 'api_call';
      }
    }

    // Strategy 4: Fuzzy name matching using normalized tokens
    const depTokens = this.tokenize(depName);
    const serviceTokens = this.tokenize(serviceName);
    const tokenOverlap = this.calculateTokenOverlap(depTokens, serviceTokens);
    if (tokenOverlap > 0) {
      // Score based on overlap percentage
      const overlapScore = Math.round(50 + tokenOverlap * 40); // 50-90 range
      if (overlapScore > bestScore) {
        bestScore = overlapScore;
        bestReason = `Token match (${Math.round(tokenOverlap * 100)}% overlap)`;
        associationType = this.inferAssociationType(dependency.name);
      }
    }

    // Strategy 5: Levenshtein distance for similar names
    if (bestScore < 60) {
      const distance = this.levenshteinDistance(depName, serviceName);
      const maxLen = Math.max(depName.length, serviceName.length);
      const similarity = 1 - distance / maxLen;
      if (similarity >= 0.6) {
        const score = Math.round(50 + similarity * 30); // 50-80 range
        if (score > bestScore) {
          bestScore = score;
          bestReason = `Similar names (${Math.round(similarity * 100)}% similar)`;
          associationType = this.inferAssociationType(dependency.name);
        }
      }
    }

    if (bestScore >= 50) {
      return {
        serviceId: service.id,
        serviceName: service.name,
        associationType,
        confidenceScore: bestScore,
        matchReason: bestReason,
      };
    }

    return null;
  }

  /**
   * Infer association type from dependency name
   */
  private inferAssociationType(name: string): AssociationType {
    const lower = name.toLowerCase();

    // Database indicators
    if (
      lower.includes('db') ||
      lower.includes('database') ||
      lower.includes('postgres') ||
      lower.includes('mysql') ||
      lower.includes('mongo') ||
      lower.includes('redis') ||
      lower.includes('sqlite')
    ) {
      return 'database';
    }

    // Cache indicators
    if (
      lower.includes('cache') ||
      lower.includes('redis') ||
      lower.includes('memcache')
    ) {
      return 'cache';
    }

    // Message queue indicators
    if (
      lower.includes('queue') ||
      lower.includes('kafka') ||
      lower.includes('rabbit') ||
      lower.includes('sqs') ||
      lower.includes('pubsub') ||
      lower.includes('message')
    ) {
      return 'message_queue';
    }

    // API indicators
    if (
      lower.includes('api') ||
      lower.includes('service') ||
      lower.includes('http') ||
      lower.includes('rest') ||
      lower.includes('grpc')
    ) {
      return 'api_call';
    }

    return 'other';
  }

  /**
   * Extract hostname from a URL or URL-like string
   */
  private extractHostname(input: string): string | null {
    try {
      // Try parsing as URL first
      const url = new URL(input);
      return url.hostname.toLowerCase();
    } catch {
      // Try extracting from common patterns
      const hostMatch = input.match(/(?:https?:\/\/)?([a-zA-Z0-9.-]+)/);
      if (hostMatch) {
        return hostMatch[1].toLowerCase();
      }
      return null;
    }
  }

  /**
   * Tokenize a name into words
   */
  private tokenize(name: string): string[] {
    return name
      .toLowerCase()
      .replace(/[-_./]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  /**
   * Calculate token overlap ratio
   */
  private calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    let overlap = 0;
    for (const token of set1) {
      if (set2.has(token)) {
        overlap++;
      }
    }

    // Return ratio of overlap to smaller set
    return overlap / Math.min(set1.size, set2.size);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
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
