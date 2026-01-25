import { Topology } from '../topology/types';
import { ServiceRegistry } from '../services/service-registry';
import { FailureState, FailureScenario, PREDEFINED_SCENARIOS } from './types';
import { CascadeEngine } from './cascade-engine';

export class FailureController {
  private activeFailures: Map<string, FailureState> = new Map();
  private cascadeEngine: CascadeEngine;
  private topology: Topology;
  private registry: ServiceRegistry | null = null;

  constructor(topology: Topology) {
    this.topology = topology;
    this.cascadeEngine = new CascadeEngine(topology);
  }

  public setRegistry(registry: ServiceRegistry): void {
    this.registry = registry;
  }

  public updateTopology(topology: Topology): void {
    this.topology = topology;
    this.cascadeEngine.updateTopology(topology);
    this.clearAllFailures();
  }

  private applyFailureToService(serviceId: string, state: FailureState | null): void {
    if (this.registry) {
      this.registry.setServiceFailure(serviceId, state);
    }
  }

  public injectFailure(serviceId: string, state: FailureState): void {
    const service = this.topology.services.find(s => s.id === serviceId || s.name === serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }

    const resolvedId = service.id;
    this.activeFailures.set(resolvedId, state);
    this.applyFailureToService(resolvedId, state);

    if (state.cascade) {
      this.cascadeEngine.propagate(
        resolvedId,
        state,
        (id, cascadedState) => {
          if (!this.activeFailures.has(id) || this.activeFailures.get(id)?.isCascaded) {
            this.activeFailures.set(id, cascadedState);
            this.applyFailureToService(id, cascadedState);
          }
        }
      );
    }
  }

  public clearFailure(serviceId: string): void {
    const service = this.topology.services.find(s => s.id === serviceId || s.name === serviceId);
    if (!service) return;

    const resolvedId = service.id;
    const state = this.activeFailures.get(resolvedId);

    if (state && !state.isCascaded) {
      this.cascadeEngine.clearCascade(resolvedId, (id) => {
        const cascadedState = this.activeFailures.get(id);
        if (cascadedState?.isCascaded && cascadedState.sourceServiceId === resolvedId) {
          this.activeFailures.delete(id);
          this.applyFailureToService(id, null);
        }
      });
    }

    this.activeFailures.delete(resolvedId);
    this.applyFailureToService(resolvedId, null);
  }

  public clearAllFailures(): void {
    for (const serviceId of this.activeFailures.keys()) {
      this.applyFailureToService(serviceId, null);
    }
    this.activeFailures.clear();
  }

  public getFailure(serviceId: string): FailureState | undefined {
    const service = this.topology.services.find(s => s.id === serviceId || s.name === serviceId);
    if (!service) return undefined;
    return this.activeFailures.get(service.id);
  }

  public getActiveFailures(): Map<string, FailureState> {
    return new Map(this.activeFailures);
  }

  public getActiveFailuresArray(): Array<{ serviceId: string; serviceName: string; state: FailureState }> {
    const result: Array<{ serviceId: string; serviceName: string; state: FailureState }> = [];
    for (const [serviceId, state] of this.activeFailures) {
      const service = this.topology.services.find(s => s.id === serviceId);
      result.push({
        serviceId,
        serviceName: service?.name || serviceId,
        state
      });
    }
    return result;
  }

  public applyScenario(scenarioName: string): void {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    let targetServices: string[] = [];

    if (scenario.targetServices) {
      targetServices = scenario.targetServices;
    } else if (scenario.targetTier) {
      targetServices = this.topology.services
        .filter(s => s.tier === scenario.targetTier)
        .map(s => s.id);
    }

    for (const serviceId of targetServices) {
      this.injectFailure(serviceId, {
        mode: scenario.mode,
        config: scenario.config,
        appliedAt: new Date(),
        cascade: scenario.cascade
      });
    }
  }

  public getScenarios(): FailureScenario[] {
    return PREDEFINED_SCENARIOS;
  }

  public static readonly SCENARIOS = PREDEFINED_SCENARIOS;
}
