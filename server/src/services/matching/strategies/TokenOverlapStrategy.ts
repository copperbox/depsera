import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { tokenize, calculateTokenOverlap } from '../../../utils/stringMatchers';
import { inferAssociationType } from '../AssociationTypeInferencer';

/**
 * Matches based on overlapping tokens between dependency and service names.
 * Confidence: 50-90% based on overlap percentage
 */
export class TokenOverlapStrategy implements MatchingStrategy {
  readonly name = 'TokenOverlap';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();

    const depTokens = tokenize(depName);
    const serviceTokens = tokenize(serviceName);
    const tokenOverlap = calculateTokenOverlap(depTokens, serviceTokens);

    if (tokenOverlap > 0) {
      // Score based on overlap percentage: 50-90 range
      const score = Math.round(50 + tokenOverlap * 40);

      return {
        score,
        reason: `Token match (${Math.round(tokenOverlap * 100)}% overlap)`,
        associationType: inferAssociationType(dependency.name),
      };
    }

    return null;
  }
}
