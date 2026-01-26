import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { calculateSimilarity } from '../../../utils/stringMatchers';
import { inferAssociationType } from '../AssociationTypeInferencer';

/**
 * Minimum similarity threshold for this strategy to return a match.
 */
const MIN_SIMILARITY = 0.6;

/**
 * Matches based on Levenshtein distance similarity between names.
 * Only activates for similarity >= 60%.
 * Confidence: 50-80% based on similarity
 */
export class LevenshteinStrategy implements MatchingStrategy {
  readonly name = 'Levenshtein';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();

    const similarity = calculateSimilarity(depName, serviceName);

    if (similarity >= MIN_SIMILARITY) {
      // Score based on similarity: 50-80 range
      const score = Math.round(50 + similarity * 30);

      return {
        score,
        reason: `Similar names (${Math.round(similarity * 100)}% similar)`,
        associationType: inferAssociationType(dependency.name),
      };
    }

    return null;
  }
}
