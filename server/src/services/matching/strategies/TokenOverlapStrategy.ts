import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { tokenize, calculateTokenOverlap, filterStopWords } from '../../../utils/stringMatchers';
import { inferAssociationType } from '../AssociationTypeInferencer';

/**
 * Minimum number of meaningful (non-stop-word) overlapping tokens
 * required for a match. Prevents single shared generic token from
 * causing false positives.
 */
const MIN_OVERLAP_COUNT = 2;

/**
 * Matches based on overlapping tokens between dependency and service names.
 * Filters out common stop words (e.g. "api", "service") before matching
 * and requires at least MIN_OVERLAP_COUNT meaningful overlapping tokens.
 * Confidence: 50-90% based on overlap percentage
 */
export class TokenOverlapStrategy implements MatchingStrategy {
  readonly name = 'TokenOverlap';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();

    const depTokens = filterStopWords(tokenize(depName));
    const serviceTokens = filterStopWords(tokenize(serviceName));
    const tokenOverlap = calculateTokenOverlap(depTokens, serviceTokens);

    if (tokenOverlap > 0) {
      // Count actual overlapping tokens
      const depSet = new Set(depTokens);
      const serviceSet = new Set(serviceTokens);
      let overlapCount = 0;
      for (const token of depSet) {
        if (serviceSet.has(token)) overlapCount++;
      }

      // Require minimum overlap count to avoid single-word false positives
      if (overlapCount < MIN_OVERLAP_COUNT) return null;

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
