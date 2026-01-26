import { Service } from '../../db/types';
import { ServicePollState } from './types';
import { ExponentialBackoff } from './backoff';

/**
 * Manages poll state for services in the health polling service.
 * Handles adding/removing services and tracking their poll status.
 */
export class PollStateManager {
  private pollStates: Map<string, ServicePollState> = new Map();

  /**
   * Add a service to the poll state.
   * @param service - The service to add
   * @returns The created poll state
   */
  addService(service: Service): ServicePollState {
    const state: ServicePollState = {
      serviceId: service.id,
      serviceName: service.name,
      healthEndpoint: service.health_endpoint,
      pollingInterval: service.polling_interval,
      lastPolled: 0,
      nextPollDue: Date.now(), // Poll immediately
      consecutiveFailures: 0,
      isPolling: false,
      backoff: new ExponentialBackoff(),
    };

    this.pollStates.set(service.id, state);
    return state;
  }

  /**
   * Remove a service from the poll state.
   * @param serviceId - The ID of the service to remove
   * @returns true if the service was removed, false if not found
   */
  removeService(serviceId: string): boolean {
    return this.pollStates.delete(serviceId);
  }

  /**
   * Get the poll state for a service.
   * @param serviceId - The ID of the service
   * @returns The poll state or undefined if not found
   */
  getState(serviceId: string): ServicePollState | undefined {
    return this.pollStates.get(serviceId);
  }

  /**
   * Check if a service is being tracked.
   * @param serviceId - The ID of the service
   * @returns true if the service is tracked
   */
  hasService(serviceId: string): boolean {
    return this.pollStates.has(serviceId);
  }

  /**
   * Get all service IDs being tracked.
   * @returns Array of service IDs
   */
  getServiceIds(): string[] {
    return Array.from(this.pollStates.keys());
  }

  /**
   * Get the number of services being tracked.
   */
  get size(): number {
    return this.pollStates.size;
  }

  /**
   * Get all services that are due for polling.
   * @param now - Current timestamp in milliseconds
   * @returns Array of poll states that are due and not currently polling
   */
  getDueServices(now: number): ServicePollState[] {
    return Array.from(this.pollStates.values())
      .filter(state => !state.isPolling && state.nextPollDue <= now);
  }

  /**
   * Get all poll states.
   * @returns Array of all poll states
   */
  getAllStates(): ServicePollState[] {
    return Array.from(this.pollStates.values());
  }

  /**
   * Mark a service as polling or not polling.
   * @param serviceId - The ID of the service
   * @param isPolling - Whether the service is currently polling
   * @returns true if the state was updated, false if service not found
   */
  markPolling(serviceId: string, isPolling: boolean): boolean {
    const state = this.pollStates.get(serviceId);
    if (!state) return false;

    state.isPolling = isPolling;
    return true;
  }

  /**
   * Update state after a poll completes.
   * @param serviceId - The ID of the service
   * @param success - Whether the poll was successful
   * @param pollingInterval - The polling interval in seconds (used on success)
   * @returns true if the state was updated, false if service not found
   */
  updateAfterPoll(serviceId: string, success: boolean, pollingInterval?: number): boolean {
    const state = this.pollStates.get(serviceId);
    if (!state) return false;

    state.lastPolled = Date.now();
    state.isPolling = false;

    if (success) {
      state.consecutiveFailures = 0;
      state.backoff.reset();
      const interval = pollingInterval ?? state.pollingInterval;
      state.nextPollDue = Date.now() + (interval * 1000);
    } else {
      state.consecutiveFailures++;
      state.nextPollDue = Date.now() + state.backoff.getNextDelay();
    }

    return true;
  }

  /**
   * Get the count of services currently polling.
   * @returns Number of services with isPolling = true
   */
  getActivePollingCount(): number {
    return Array.from(this.pollStates.values())
      .filter(s => s.isPolling).length;
  }

  /**
   * Clear all poll states.
   */
  clear(): void {
    this.pollStates.clear();
  }
}
