import { Topology, GeneratedService, ServiceTier } from '../topology/types';
import { FailureState, FailureMode } from '../failures/types';
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

// Generate checkDetails based on dependency type
function generateCheckDetails(depType: DependencyType, serviceName: string): Record<string, unknown> {
  const basePort = 5000 + Math.floor(Math.random() * 1000);

  switch (depType) {
    case 'database':
      return {
        host: `${serviceName.toLowerCase().replace(/\s+/g, '-')}-db.internal`,
        port: 5432,
        database: serviceName.toLowerCase().replace(/\s+/g, '_'),
        dbType: 'postgresql'
      };
    case 'rest':
      return {
        url: `http://${serviceName.toLowerCase().replace(/\s+/g, '-')}.internal:${basePort}/api`,
        method: 'GET',
        timeout: 30000
      };
    case 'cache':
      return {
        host: `${serviceName.toLowerCase().replace(/\s+/g, '-')}-cache.internal`,
        port: 6379,
        dbType: 'redis'
      };
    case 'message_queue':
      return {
        broker: `${serviceName.toLowerCase().replace(/\s+/g, '-')}-mq.internal`,
        queue: `${serviceName.toLowerCase().replace(/\s+/g, '_')}_events`,
        protocol: 'amqp'
      };
    case 'grpc':
      return {
        host: `${serviceName.toLowerCase().replace(/\s+/g, '-')}.internal`,
        port: basePort,
        service: serviceName,
        method: 'Check'
      };
    default:
      return {
        endpoint: `${serviceName.toLowerCase().replace(/\s+/g, '-')}.internal:${basePort}`
      };
  }
}

// Generate error object based on failure type
function generateErrorObject(depType: DependencyType, serviceName: string): { error: unknown; errorMessage: string } {
  const checkDetails = generateCheckDetails(depType, serviceName);

  switch (depType) {
    case 'database':
      return {
        error: { code: 'ECONNREFUSED', errno: -111, syscall: 'connect' },
        errorMessage: `Connection refused to ${checkDetails.host}:${checkDetails.port}`
      };
    case 'rest':
      return {
        error: { code: 'ETIMEDOUT', errno: -110, syscall: 'connect' },
        errorMessage: `Request timeout connecting to ${checkDetails.url}`
      };
    case 'cache':
      return {
        error: { code: 'ECONNRESET', errno: -104, syscall: 'read' },
        errorMessage: `Connection reset by ${checkDetails.host}:${checkDetails.port}`
      };
    case 'message_queue':
      return {
        error: { code: 'ENOTFOUND', errno: -3008, syscall: 'getaddrinfo' },
        errorMessage: `Unable to resolve broker ${checkDetails.broker}`
      };
    default:
      return {
        error: { code: 'EHOSTUNREACH', errno: -113 },
        errorMessage: `Host unreachable: ${serviceName}`
      };
  }
}

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
          errorMessage: 'Service not found',
          error: { code: 'ENOENT', errno: -2 }
        };
      }

      // Generate simulated latency based on the target service's tier
      const genService = this.topology.services.find(s => s.id === serviceId);
      const tier = genService?.tier || ServiceTier.API;
      const simulatedLatency = generateSimulatedLatency(tier);

      // Apply the simulated delay
      await this.delay(simulatedLatency);

      const health = await service.getHealth();

      // Generate checkDetails for this dependency type
      const checkDetails = generateCheckDetails(depType, service.name);

      // If unhealthy, generate appropriate error object
      if (!health.healthy) {
        const errorInfo = generateErrorObject(depType, service.name);
        return {
          name: service.name,
          description: `Dependency on ${service.name}`,
          type: depType,
          healthy: false,
          healthCode: 503,
          latencyMs: simulatedLatency,
          lastChecked: new Date().toISOString(),
          impact: `May affect service if ${service.name} is unavailable`,
          checkDetails,
          error: errorInfo.error,
          errorMessage: errorInfo.errorMessage
        };
      }

      return {
        name: service.name,
        description: `Dependency on ${service.name}`,
        type: depType,
        healthy: true,
        healthCode: 200,
        latencyMs: simulatedLatency,
        lastChecked: new Date().toISOString(),
        impact: `May affect service if ${service.name} is unavailable`,
        checkDetails
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

  /**
   * Fast version for control panel - skips simulated latency and dependency checks.
   * Returns basic service status based on failure state only.
   */
  public getAllServiceStatusesFast(): Array<{
    id: string;
    name: string;
    tier: string;
    health: { healthy: boolean; timestamp: string };
    failureState: FailureState | null;
  }> {
    const statuses = [];
    for (const service of this.services.values()) {
      const failureState = service.getFailureState();
      // Service is unhealthy if it has an active failure (except high_latency which is still "healthy")
      const isUnhealthy = failureState !== null &&
        failureState.mode !== FailureMode.HIGH_LATENCY;

      statuses.push({
        id: service.id,
        name: service.name,
        tier: service.tier,
        health: {
          healthy: !isUnhealthy,
          timestamp: new Date().toISOString()
        },
        failureState
      });
    }
    return statuses;
  }
}
