import { Dependency, Service } from '../../../db/types';
import { MatchingStrategy, StrategyResult } from './types';
import { extractHostname } from '../../../utils/stringMatchers';

/**
 * Matches when the hostname in the dependency name matches the service's health endpoint hostname.
 * Confidence: 90%
 */
export class HostnameMatchStrategy implements MatchingStrategy {
  readonly name = 'HostnameMatch';

  match(dependency: Dependency, service: Service): StrategyResult | null {
    const depHostname = extractHostname(dependency.name);
    const serviceHostname = extractHostname(service.health_endpoint);

    if (depHostname && serviceHostname && depHostname === serviceHostname) {
      return {
        score: 90,
        reason: 'Hostname match',
        associationType: 'api_call',
      };
    }

    return null;
  }
}
