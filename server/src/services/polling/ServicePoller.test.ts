import { ServicePoller } from './ServicePoller';
import { Service } from '../../db/types';
import { DependencyParser } from './DependencyParser';
import { DependencyUpsertService } from './DependencyUpsertService';

// Mock SSRF validation
jest.mock('../../utils/ssrf', () => ({
  validateUrlNotPrivate: jest.fn().mockResolvedValue(undefined),
}));

import { validateUrlNotPrivate } from '../../utils/ssrf';
const mockValidateUrl = validateUrlNotPrivate as jest.MockedFunction<typeof validateUrlNotPrivate>;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ServicePoller', () => {
  const createService = (overrides?: Partial<Service>): Service => ({
    id: 'svc-1',
    name: 'Test Service',
    team_id: 'team-1',
    health_endpoint: 'http://test-service/health',
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    is_active: 1,
    is_external: 0,
    description: null,
    last_poll_success: null,
    last_poll_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  const mockParser = {
    parse: jest.fn().mockReturnValue([
      {
        name: 'TestDep',
        healthy: true,
        health: { state: 0, code: 200, latency: 50 },
        lastChecked: new Date().toISOString(),
      },
    ]),
  } as unknown as DependencyParser;

  const mockUpsertService = {
    upsert: jest.fn().mockReturnValue([]),
  } as unknown as DependencyUpsertService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create poller with service', () => {
      const service = createService();
      const poller = new ServicePoller(service);

      expect(poller.serviceId).toBe('svc-1');
      expect(poller.serviceName).toBe('Test Service');
    });
  });

  describe('poll', () => {
    it('should successfully poll and return result', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          dependencies: [{ name: 'TestDep', healthy: true }],
        }),
      });

      const result = await poller.poll();

      expect(result.success).toBe(true);
      expect(result.dependenciesUpdated).toBe(1);
      expect(result.statusChanges).toEqual([]);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure result on fetch error', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.dependenciesUpdated).toBe(0);
    });

    it('should return failure on non-ok response', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should include status changes from upsert service', async () => {
      const service = createService();
      const upsertWithChanges = {
        upsert: jest.fn().mockReturnValue([
          {
            serviceId: 'svc-1',
            serviceName: 'Test Service',
            dependencyName: 'TestDep',
            previousHealthy: true,
            currentHealthy: false,
            timestamp: new Date().toISOString(),
          },
        ]),
      } as unknown as DependencyUpsertService;

      const poller = new ServicePoller(service, mockParser, upsertWithChanges);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });

      const result = await poller.poll();

      expect(result.statusChanges).toHaveLength(1);
      expect(result.statusChanges[0].dependencyName).toBe('TestDep');
    });

    it('should handle abort timeout', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await poller.poll();

      expect(result.success).toBe(false);
    });

    it('should handle non-Error thrown', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockRejectedValueOnce('string error');

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });

  describe('SSRF protection', () => {
    it('should validate URL before fetching', async () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });

      await poller.poll();

      expect(mockValidateUrl).toHaveBeenCalledWith('http://test-service/health');
    });

    it('should fail poll when SSRF validation rejects', async () => {
      const service = createService({ health_endpoint: 'http://169.254.169.254/meta-data' });
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      mockValidateUrl.mockRejectedValueOnce(new Error('Blocked private IP: 169.254.169.254'));

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked private IP');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateService', () => {
    it('should update service configuration', () => {
      const service = createService();
      const poller = new ServicePoller(service, mockParser, mockUpsertService);

      expect(poller.serviceName).toBe('Test Service');

      const updatedService = createService({ name: 'Updated Service' });
      poller.updateService(updatedService);

      expect(poller.serviceName).toBe('Updated Service');
    });
  });
});
