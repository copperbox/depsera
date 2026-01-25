import { Topology, GeneratedService } from '../topology/types';
import { FailureState } from '../failures/types';
import { MockService } from './mock-service';
import { DependencyStatus, ServiceHealth, DependencyType } from './types';

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

      const startTime = Date.now();
      const health = await service.getHealth();
      const latencyMs = Date.now() - startTime;

      return {
        name: service.name,
        description: `Dependency on ${service.name}`,
        type: depType,
        healthy: health.healthy,
        healthCode: health.healthy ? 200 : 503,
        latencyMs,
        lastChecked: new Date().toISOString(),
        impact: `May affect service if ${service.name} is unavailable`,
        errorMessage: health.healthy ? undefined : 'Dependency unhealthy'
      };
    };
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
