import { DependencyMonitor } from 'proactive-deps';
import { ServiceTier } from '../topology/types';
import { FailureMode, FailureState } from '../failures/types';
import { DependencyStatus, ServiceHealth, MockServiceConfig, HealthCheckCallback } from './types';

export class MockService {
  public readonly id: string;
  public readonly name: string;
  public readonly tier: ServiceTier;

  private monitor: DependencyMonitor;
  private failureState: FailureState | null = null;
  private dependencyIds: string[];
  private checkDependencyHealth: HealthCheckCallback;
  private started = false;

  constructor(config: MockServiceConfig, checkDependencyHealth: HealthCheckCallback) {
    this.id = config.id;
    this.name = config.name;
    this.tier = config.tier;
    this.dependencyIds = config.dependencyIds;
    this.checkDependencyHealth = checkDependencyHealth;

    this.monitor = new DependencyMonitor({
      checkIntervalMs: 5000,
      cacheDurationMs: 10000
    });

    this.registerDependencies();
  }

  private registerDependencies(): void {
    for (const depId of this.dependencyIds) {
      this.monitor.register({
        name: depId,
        description: `Dependency on service ${depId}`,
        impact: 'Service may be degraded or unavailable',
        check: async () => {
          const status = await this.checkDependencyHealth(depId);
          if (!status.healthy) {
            return {
              code: status.healthCode,
              errorMessage: status.errorMessage || 'Dependency unhealthy'
            };
          }
          return 0;
        }
      });
    }
  }

  public setFailure(state: FailureState | null): void {
    this.failureState = state;
  }

  public getFailureState(): FailureState | null {
    return this.failureState;
  }

  public async getHealth(): Promise<ServiceHealth> {
    if (this.failureState) {
      return this.applyFailure();
    }

    const statuses = await this.getDependencyStatuses();
    const healthy = statuses.every(s => s.healthy);

    return {
      name: this.name,
      tier: this.tier,
      healthy,
      failureState: null,
      dependencies: statuses,
      timestamp: new Date().toISOString()
    };
  }

  private async applyFailure(): Promise<ServiceHealth> {
    const state = this.failureState!;

    switch (state.mode) {
      case FailureMode.OUTAGE:
        return {
          name: this.name,
          tier: this.tier,
          healthy: false,
          failureState: state,
          dependencies: [],
          timestamp: new Date().toISOString()
        };

      case FailureMode.HIGH_LATENCY: {
        await this.delay(state.config.latencyMs || 3000);
        const statuses = await this.getDependencyStatuses();
        return {
          name: this.name,
          tier: this.tier,
          healthy: statuses.every(s => s.healthy),
          failureState: state,
          dependencies: statuses,
          timestamp: new Date().toISOString()
        };
      }

      case FailureMode.ERROR:
        return {
          name: this.name,
          tier: this.tier,
          healthy: false,
          failureState: state,
          dependencies: [{
            name: 'self',
            description: 'Service error',
            healthy: false,
            healthCode: state.config.errorCode || 500,
            latencyMs: 0,
            lastChecked: new Date().toISOString(),
            errorMessage: state.config.errorMessage || 'Internal error'
          }],
          timestamp: new Date().toISOString()
        };

      case FailureMode.INTERMITTENT: {
        const shouldFail = Math.random() < (state.config.errorRate || 0.5);
        if (shouldFail) {
          return {
            name: this.name,
            tier: this.tier,
            healthy: false,
            failureState: state,
            dependencies: [{
              name: 'self',
              description: 'Intermittent failure',
              healthy: false,
              healthCode: 503,
              latencyMs: 0,
              lastChecked: new Date().toISOString(),
              errorMessage: 'Service temporarily unavailable'
            }],
            timestamp: new Date().toISOString()
          };
        }
        const intermittentStatuses = await this.getDependencyStatuses();
        return {
          name: this.name,
          tier: this.tier,
          healthy: intermittentStatuses.every(s => s.healthy),
          failureState: state,
          dependencies: intermittentStatuses,
          timestamp: new Date().toISOString()
        };
      }

      default:
        return this.getHealth();
    }
  }

  public async getDependencyStatuses(): Promise<DependencyStatus[]> {
    const statuses: DependencyStatus[] = [];

    for (const depId of this.dependencyIds) {
      const status = await this.checkDependencyHealth(depId);
      statuses.push(status);
    }

    return statuses;
  }

  public async getMetrics(): Promise<string> {
    return this.monitor.getPrometheusMetrics();
  }

  public start(): void {
    if (!this.started) {
      this.monitor.startDependencyCheckInterval();
      this.started = true;
    }
  }

  public stop(): void {
    if (this.started) {
      this.monitor.stopDependencyCheckInterval();
      this.started = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
