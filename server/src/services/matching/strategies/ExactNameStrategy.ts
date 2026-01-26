import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { inferAssociationType } from '../AssociationTypeInferencer';

/**
 * Matches when dependency name exactly equals service name (case-insensitive).
 * Confidence: 100%
 */
export class ExactNameStrategy implements MatchingStrategy {
  readonly name = 'ExactName';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();

    if (depName === serviceName) {
      return {
        score: 100,
        reason: 'Exact name match',
        associationType: inferAssociationType(dependency.name),
      };
    }

    return null;
  }
}
