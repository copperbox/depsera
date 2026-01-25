import { Topology, GeneratedService, ServiceTier } from '../topology/types';
import { FailureState } from '../failures/types';
import { MockService } from './mock-service';
import { DependencyStatus, ServiceHealth, DependencyType } from './types';

// Latency ranges by tier (in milliseconds)
// Lower tiers (databases) tend to be faster, higher tiers have more variability
const LATENCY_RANGES: Record<ServiceTier, { base: number; variance: number }> = {
  [ServiceTier.FRONTEND]: { base: 50, variance: 150 },   // 50-200ms
  [ServiceTier.API]: { base: 30, variance: 120 },        // 30-150ms
  [ServiceTier.BACKEND]: { base: 20, variance: 80 },     // 20-100ms
  [ServiceTier.DATABASE]: { base: 5, variance: 45 }      // 5-50ms
};

// Probability of experiencing a latency spike
const LATENCY_SPIKE_PROBABILITY = 0.05;
const LATENCY_SPIKE_MULTIPLIER = 3;

function generateSimulatedLatency(tier: ServiceTier): number {
  const range = LATENCY_RANGES[tier];
  let latency = range.base + Math.random() * range.variance;

  // Occasional latency spikes to simulate real-world conditions
  if (Math.random() < LATENCY_SPIKE_PROBABILITY) {
    latency *= LATENCY_SPIKE_MULTIPLIER;
  }

  return Math.round(latency);
}

export class ServiceRegistry {
  private services: Map<string, MockService> = new Map();
  private servicesByName: Map<string, MockService> = new Map();
  private topology: Topology;

  constructor(topology: Topology) {
    this.topology = topology;
    this.initializeServices();
  }

  private initializeServices(): void {
    for (const genService of this.topology.services) {
      const mockService = new MockService(
        {
          id: genService.id,
          name: genService.name,
          tier: genService.tier,
          dependencies: genService.dependencies.map(dep => ({
            id: dep.serviceId,
            type: dep.type
          }))
        },
        this.createHealthCheckCallback()
      );

      this.services.set(genService.id, mockService);
      this.servicesByName.set(genService.name, mockService);
    }
  }

  private createHealthCheckCallback() {
    return async (serviceId: string, depType: DependencyType): Promise<DependencyStatus> => {
      const service = this.services.get(serviceId);
      if (!service) {
        return {
          name: serviceId,
          description: 'Unknown service',
          type: depType,
          healthy: false,
          healthCode: 404,
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
          errorMessage: 'Service not found'
        };
      }

      // Generate simulated latency based on the target service's tier
      const genService = this.topology.services.find(s => s.id === serviceId);
      const tier = genService?.tier || ServiceTier.API;
      const simulatedLatency = generateSimulatedLatency(tier);

      // Apply the simulated delay
      await this.delay(simulatedLatency);

      const health = await service.getHealth();

      return {
        name: service.name,
        description: `Dependency on ${service.name}`,
        type: depType,
        healthy: health.healthy,
        healthCode: health.healthy ? 200 : 503,
        latencyMs: simulatedLatency,
        lastChecked: new Date().toISOString(),
        impact: `May affect service if ${service.name} is unavailable`,
        errorMessage: health.healthy ? undefined : 'Dependency unhealthy'
      };
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getService(idOrName: string): MockService | undefined {
    return this.services.get(idOrName) || this.servicesByName.get(idOrName);
  }

  public getAllServices(): MockService[] {
    return Array.from(this.services.values());
  }

  public getTopology(): Topology {
    return this.topology;
  }

  public getGeneratedService(idOrName: string): GeneratedService | undefined {
    const service = this.getService(idOrName);
    if (!service) return undefined;
    return this.topology.services.find(s => s.id === service.id);
  }

  public async getServiceHealth(idOrName: string): Promise<ServiceHealth | null> {
    const service = this.getService(idOrName);
    if (!service) return null;
    return service.getHealth();
  }

  public setServiceFailure(idOrName: string, state: FailureState | null): boolean {
    const service = this.getService(idOrName);
    if (!service) return false;
    service.setFailure(state);
    return true;
  }

  public startAll(): void {
    for (const service of this.services.values()) {
      service.start();
    }
  }

  public stopAll(): void {
    for (const service of this.services.values()) {
      service.stop();
    }
  }

  public reset(newTopology: Topology): void {
    this.stopAll();
    this.services.clear();
    this.servicesByName.clear();
    this.topology = newTopology;
    this.initializeServices();
  }

  public async getAllServiceStatuses(): Promise<Array<{
    id: string;
    name: string;
    tier: string;
    health: ServiceHealth;
    failureState: FailureState | null;
  }>> {
    const statuses = [];
    for (const service of this.services.values()) {
      statuses.push({
        id: service.id,
        name: service.name,
        tier: service.tier,
        health: await service.getHealth(),
        failureState: service.getFailureState()
      });
    }
    return statuses;
  }
}
