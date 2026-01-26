import { AssociationType, Dependency, Service } from '../../../db/types';

/**
 * Result from a matching strategy
 */
export interface StrategyResult {
  /** Confidence score (0-100) */
  score: number;
  /** Human-readable reason for the match */
  reason: string;
  /** Inferred association type */
  associationType: AssociationType;
}

/**
 * Interface for matching strategies.
 * Each strategy implements a different approach to matching
 * a dependency to a potential target service.
 */
export interface MatchingStrategy {
  /** Unique name identifying this strategy */
  readonly name: string;

  /**
   * Attempt to match a dependency to a service.
   * @param dependency - The dependency to match
   * @param service - The potential target service
   * @returns StrategyResult if matched, null if no match
   */
  match(dependency: Dependency, service: Service): StrategyResult | null;
}

/**
 * Combined result from running all strategies
 */
export interface BestMatch {
  serviceId: string;
  serviceName: string;
  result: StrategyResult;
  strategyName: string;
}
