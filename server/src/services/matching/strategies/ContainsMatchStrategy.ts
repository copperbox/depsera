import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { inferAssociationType } from '../AssociationTypeInferencer';

/**
 * Matches when service name contains dependency name or vice versa.
 * Confidence: 80%
 */
export class ContainsMatchStrategy implements MatchingStrategy {
  readonly name = 'ContainsMatch';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depName = dependency.name.toLowerCase();
    const serviceName = service.name.toLowerCase();

    if (serviceName.includes(depName) || depName.includes(serviceName)) {
      return {
        score: 80,
        reason: 'Name contains match',
        associationType: inferAssociationType(dependency.name),
      };
    }

    return null;
  }
}
