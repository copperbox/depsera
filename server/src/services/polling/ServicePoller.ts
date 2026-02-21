import { Service, ProactiveDepsStatus } from '../../db/types';
import { ExponentialBackoff } from './backoff';
import { PollResult } from './types';
import { DependencyParser, getDependencyParser } from './DependencyParser';
import { DependencyUpsertService, getDependencyUpsertService } from './DependencyUpsertService';
import { validateUrlNotPrivate } from '../../utils/ssrf';
import { sanitizePollError } from '../../utils/errors';

const POLL_TIMEOUT_MS = 10000;

export class ServicePoller {
  private service: Service;
  private backoff: ExponentialBackoff;
  private consecutiveFailures = 0;
  private parser: DependencyParser;
  private upsertService: DependencyUpsertService;

  constructor(
    service: Service,
    parser?: DependencyParser,
    upsertService?: DependencyUpsertService
  ) {
    this.service = service;
    this.backoff = new ExponentialBackoff();
    this.parser = parser || getDependencyParser();
    this.upsertService = upsertService || getDependencyUpsertService();
  }

  /* istanbul ignore next -- Getter used by HealthPollingService for logging */
  get serviceName(): string {
    return this.service.name;
  }

  /* istanbul ignore next -- Getter used by HealthPollingService for state tracking */
  get serviceId(): string {
    return this.service.id;
  }

  async poll(): Promise<PollResult> {
    const startTime = Date.now();

    try {
      const deps = await this.fetchHealthEndpoint();
      const changes = this.upsertService.upsert(this.service, deps);

      // Reset backoff on success
      this.backoff.reset();
      this.consecutiveFailures = 0;

      return {
        success: true,
        dependenciesUpdated: deps.length,
        statusChanges: changes,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.consecutiveFailures++;

      return {
        success: false,
        dependenciesUpdated: 0,
        statusChanges: [],
        error: sanitizePollError(error instanceof Error ? error.message : String(error)),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /* istanbul ignore next -- Used by HealthPollingService for config updates */
  updateService(service: Service): void {
    this.service = service;
  }

  private async fetchHealthEndpoint(): Promise<ProactiveDepsStatus[]> {
    // Validate URL against private/internal IPs (DNS rebinding protection)
    await validateUrlNotPrivate(this.service.health_endpoint);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

    try {
      const response = await fetch(this.service.health_endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Dependencies-Dashboard/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parser.parse(data);
    } finally {
      clearTimeout(timeout);
    }
  }
}
