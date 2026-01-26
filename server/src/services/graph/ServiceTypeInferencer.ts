import { DependencyType } from '../../db/types';
import { DependencyWithTarget } from './types';

/**
 * Infers service types based on incoming dependency relationships.
 * A service's type is determined by the most common type of dependencies that point to it.
 */
export class ServiceTypeInferencer {
  /**
   * Compute service types based on incoming dependency types.
   * @param dependencies - Dependencies with their target service associations
   * @returns Map of service ID to inferred dependency type
   */
  compute(dependencies: DependencyWithTarget[]): Map<string, DependencyType> {
    // Count incoming dependency types per service
    const incomingTypes = this.countIncomingTypes(dependencies);

    // Determine dominant type for each service
    return this.computeDominantTypes(incomingTypes);
  }

  /**
   * Count the types of dependencies pointing to each service.
   */
  private countIncomingTypes(
    dependencies: DependencyWithTarget[]
  ): Map<string, Map<DependencyType, number>> {
    const incomingTypes = new Map<string, Map<DependencyType, number>>();

    for (const dep of dependencies) {
      if (!dep.target_service_id) continue;

      if (!incomingTypes.has(dep.target_service_id)) {
        incomingTypes.set(dep.target_service_id, new Map());
      }

      const typeCounts = incomingTypes.get(dep.target_service_id)!;
      typeCounts.set(dep.type, (typeCounts.get(dep.type) || 0) + 1);
    }

    return incomingTypes;
  }

  /**
   * Determine the dominant type for each service based on type counts.
   */
  private computeDominantTypes(
    incomingTypes: Map<string, Map<DependencyType, number>>
  ): Map<string, DependencyType> {
    const serviceTypes = new Map<string, DependencyType>();

    for (const [serviceId, typeCounts] of incomingTypes) {
      let maxCount = 0;
      let dominantType: DependencyType = 'other';

      for (const [type, count] of typeCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantType = type;
        }
      }

      serviceTypes.set(serviceId, dominantType);
    }

    return serviceTypes;
  }
}
