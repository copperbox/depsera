import { Topology, GeneratedService } from '../topology/types';
import { FailureMode, FailureState } from './types';

export class CascadeEngine {
  private topology: Topology;
  private cascadedServices: Map<string, Set<string>> = new Map();

  constructor(topology: Topology) {
    this.topology = topology;
  }

  public updateTopology(topology: Topology): void {
    this.topology = topology;
    this.cascadedServices.clear();
  }

  public findDependents(serviceId: string): Set<string> {
    const dependents = new Set<string>();
    const queue = [serviceId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const service of this.topology.services) {
        const dependsOnCurrent = service.dependencies.some(dep => dep.serviceId === current);
        if (dependsOnCurrent && !dependents.has(service.id)) {
          dependents.add(service.id);
          queue.push(service.id);
        }
      }
    }

    return dependents;
  }

  public propagate(
    sourceServiceId: string,
    _sourceState: FailureState,
    applyFailure: (serviceId: string, state: FailureState) => void
  ): void {
    const affected = this.findDependents(sourceServiceId);
    this.cascadedServices.set(sourceServiceId, affected);

    const sourceService = this.topology.services.find(s => s.id === sourceServiceId);
    const sourceName = sourceService?.name || sourceServiceId;

    for (const serviceId of affected) {
      const cascadedState: FailureState = {
        mode: FailureMode.ERROR,
        config: {
          errorCode: 503,
          errorMessage: `Upstream dependency ${sourceName} is failing`
        },
        appliedAt: new Date(),
        cascade: false,
        isCascaded: true,
        sourceServiceId
      };
      applyFailure(serviceId, cascadedState);
    }
  }

  public clearCascade(
    sourceServiceId: string,
    clearFailure: (serviceId: string) => void
  ): void {
    const affected = this.cascadedServices.get(sourceServiceId);
    if (affected) {
      for (const serviceId of affected) {
        clearFailure(serviceId);
      }
      this.cascadedServices.delete(sourceServiceId);
    }
  }

  public getCascadedServices(sourceServiceId: string): Set<string> | undefined {
    return this.cascadedServices.get(sourceServiceId);
  }

  public getServiceById(serviceId: string): GeneratedService | undefined {
    return this.topology.services.find(s => s.id === serviceId);
  }
}
