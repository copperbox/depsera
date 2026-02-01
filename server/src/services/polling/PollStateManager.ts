import { Service } from '../../db/types';
import { ServicePollState } from './types';

/**
 * Manages poll state for services in the health polling service.
 * Handles adding/removing services and tracking their poll status.
 */
export class PollStateManager {
  private pollStates: Map<string, ServicePollState> = new Map();

  addService(service: Service): ServicePollState {
    const state: ServicePollState = {
      serviceId: service.id,
      serviceName: service.name,
      healthEndpoint: service.health_endpoint,
      lastPolled: 0,
      consecutiveFailures: 0,
      isPolling: false,
    };

    this.pollStates.set(service.id, state);
    return state;
  }

  removeService(serviceId: string): boolean {
    return this.pollStates.delete(serviceId);
  }

  getState(serviceId: string): ServicePollState | undefined {
    return this.pollStates.get(serviceId);
  }

  hasService(serviceId: string): boolean {
    return this.pollStates.has(serviceId);
  }

  getServiceIds(): string[] {
    return Array.from(this.pollStates.keys());
  }

  get size(): number {
    return this.pollStates.size;
  }

  getAllStates(): ServicePollState[] {
    return Array.from(this.pollStates.values());
  }

  markPolling(serviceId: string, isPolling: boolean): boolean {
    const state = this.pollStates.get(serviceId);
    if (!state) return false;

    state.isPolling = isPolling;
    return true;
  }

  getActivePollingCount(): number {
    return Array.from(this.pollStates.values())
      .filter(s => s.isPolling).length;
  }

  clear(): void {
    this.pollStates.clear();
  }
}
