import { Dependency, Service } from '../../db/types';
import {
  MatchingStrategy,
  StrategyResult,
  ExactNameStrategy,
  ContainsMatchStrategy,
  HostnameMatchStrategy,
  TokenOverlapStrategy,
  LevenshteinStrategy,
} from './strategies';

/**
 * Result from matching a dependency against a service
 */
export interface MatchExecutionResult {
  serviceId: string;
  serviceName: string;
  result: StrategyResult;
  strategyName: string;
}

/**
 * Minimum confidence score to consider a match valid
 */
const MIN_CONFIDENCE_THRESHOLD = 50;

/**
 * Executes matching strategies in priority order and returns the best match.
 */
export class MatchingStrategyExecutor {
  private strategies: MatchingStrategy[];

  constructor(strategies?: MatchingStrategy[]) {
    // Default strategies in priority order
    this.strategies = strategies || [
      new ExactNameStrategy(),
      new HostnameMatchStrategy(),
      new ContainsMatchStrategy(),
      new TokenOverlapStrategy(),
      new LevenshteinStrategy(),
    ];
  }

  /**
   * Find the best match for a dependency against a single service.
   * Runs all strategies and returns the highest-scoring match.
   * @param dependency - The dependency to match
   * @param service - The potential target service
   * @returns The best match result, or null if no strategy matched
   */
  findBestMatch(dependency: Dependency, service: Service): StrategyResult | null {
    let bestResult: StrategyResult | null = null;
    let bestScore = 0;

    for (const strategy of this.strategies) {
      const result = strategy.match(dependency, service);
      if (result && result.score > bestScore) {
        bestScore = result.score;
        bestResult = result;
      }
    }

    return bestResult;
  }

  /**
   * Find all matches for a dependency against multiple services.
   * @param dependency - The dependency to match
   * @param services - List of candidate services
   * @param excludeServiceIds - Service IDs to exclude from matching
   * @returns Array of matches sorted by confidence score (descending)
   */
  findAllMatches(
    dependency: Dependency,
    services: Service[],
    excludeServiceIds?: Set<string>
  ): MatchExecutionResult[] {
    const matches: MatchExecutionResult[] = [];

    for (const service of services) {
      // Skip excluded services
      if (excludeServiceIds?.has(service.id)) continue;
      // Skip the service that owns this dependency
      if (service.id === dependency.service_id) continue;

      let bestResult: StrategyResult | null = null;
      let bestStrategyName = '';

      // Run all strategies and keep the best match for this service
      for (const strategy of this.strategies) {
        const result = strategy.match(dependency, service);
        if (result && (!bestResult || result.score > bestResult.score)) {
          bestResult = result;
          bestStrategyName = strategy.name;
        }
      }

      // Only include matches above the minimum threshold
      if (bestResult && bestResult.score >= MIN_CONFIDENCE_THRESHOLD) {
        matches.push({
          serviceId: service.id,
          serviceName: service.name,
          result: bestResult,
          strategyName: bestStrategyName,
        });
      }
    }

    // Sort by confidence score descending
    return matches.sort((a, b) => b.result.score - a.result.score);
  }

  /**
   * Get the list of strategy names in execution order
   */
  getStrategyNames(): string[] {
    return this.strategies.map(s => s.name);
  }
}
