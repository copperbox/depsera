import { ManifestSyncService, ManifestSyncEventType } from './ManifestSyncService';
import { DEFAULT_SYNC_POLICY, ManifestSyncPolicy, TeamManifestConfig } from './types';
import type { Service } from '../../db/types';

// --- Mocks ---

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFetch = jest.fn();
jest.mock('./ManifestFetcher', () => ({
  fetchManifest: (...args: any[]) => mockFetch(...args),
}));

const mockValidate = jest.fn();
jest.mock('./ManifestValidator', () => ({
  validateManifest: (...args: any[]) => mockValidate(...args),
}));

const mockDiff = jest.fn();
jest.mock('./ManifestDiffer', () => ({
  diffManifest: (...args: any[]) => mockDiff(...args),
}));

const mockAudit = jest.fn();
jest.mock('../audit/AuditLogService', () => ({
  logAuditEvent: (...args: any[]) => mockAudit(...args),
}));

const mockSsrfValidate = jest.fn();
jest.mock('../../utils/ssrf', () => ({
  validateUrlNotPrivate: (...args: any[]) => mockSsrfValidate(...args),
}));

const mockPollingService = {
  startService: jest.fn(),
  stopService: jest.fn(),
  restartService: jest.fn(),
};
jest.mock('../polling/HealthPollingService', () => ({
  HealthPollingService: {
    getInstance: () => mockPollingService,
  },
}));

// Mock withTransaction to run callback synchronously with provided stores
let mockTxCallback: ((stores: any) => any) | null = null;
let mockTxStores: any = {};
jest.mock('../../stores', () => ({
  getStores: () => ({}),
  StoreRegistry: { create: () => ({}) },
  withTransaction: (fn: (stores: any) => any) => fn(mockTxStores),
  withTransactionAsync: async (fn: (stores: any) => any) => fn(mockTxStores),
}));

// --- Helpers ---

function makeConfig(overrides: Partial<TeamManifestConfig> = {}): TeamManifestConfig {
  return {
    id: 'config-1',
    team_id: 'team-1',
    manifest_url: 'https://example.com/manifest.json',
    is_enabled: 1,
    sync_policy: null,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_error: null,
    last_sync_summary: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'Service A',
    team_id: 'team-1',
    health_endpoint: 'https://svc-a.example.com/health',
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    is_active: 1,
    is_external: 0,
    description: null,
    last_poll_success: null,
    last_poll_error: null,
    poll_warnings: null,
    manifest_key: 'svc-a',
    manifest_managed: 1,
    manifest_last_synced_values: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockStores() {
  const dbPrepare = jest.fn().mockReturnValue({
    run: jest.fn(),
    get: jest.fn(),
  });

  return {
    teams: {
      findAll: jest.fn().mockReturnValue([
        { id: 'team-1', name: 'Team One', key: 'team-one', description: null, created_at: '', updated_at: '' },
        { id: 'team-2', name: 'Team Two', key: 'team-two', description: null, created_at: '', updated_at: '' },
      ]),
    },
    manifestConfig: {
      findByTeamId: jest.fn(),
      findAllEnabled: jest.fn().mockReturnValue([]),
      updateSyncResult: jest.fn().mockReturnValue(true),
    },
    manifestSyncHistory: {
      create: jest.fn().mockReturnValue({ id: 'history-1', status: 'success' }),
      findByTeamId: jest.fn().mockReturnValue({ history: [], total: 0 }),
    },
    services: {
      findByTeamId: jest.fn().mockReturnValue([]),
      findAll: jest.fn().mockReturnValue([]),
      findById: jest.fn(),
      create: jest.fn().mockReturnValue(makeService()),
      update: jest.fn().mockReturnValue(makeService()),
      delete: jest.fn().mockReturnValue(true),
      db: { prepare: dbPrepare },
    },
    driftFlags: {
      upsertFieldDrift: jest.fn().mockReturnValue({ action: 'created', flag: {} }),
      upsertRemovalDrift: jest.fn().mockReturnValue({ action: 'created', flag: {} }),
      findActiveByServiceId: jest.fn().mockReturnValue([]),
      resolveAllForService: jest.fn().mockReturnValue(0),
      resolve: jest.fn().mockReturnValue(true),
    },
    aliases: {
      findAll: jest.fn().mockReturnValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockReturnValue(true),
      resolveAlias: jest.fn().mockReturnValue(null),
      db: { prepare: dbPrepare },
    },
    canonicalOverrides: {
      findAll: jest.fn().mockReturnValue([]),
      upsert: jest.fn(),
      deleteByTeam: jest.fn().mockReturnValue(true),
    },
    associations: {
      findByDependencyId: jest.fn().mockReturnValue([]),
      create: jest.fn().mockReturnValue({ id: 'assoc-1' }),
      delete: jest.fn().mockReturnValue(true),
      db: { prepare: dbPrepare },
    },
    dependencies: {
      findByServiceId: jest.fn().mockReturnValue([]),
    },
  } as any;
}

function createSyncService(stores: any): ManifestSyncService {
  return ManifestSyncService.createForTesting(stores);
}

function setupEmptyManifestSync(stores: any) {
  stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
  stores.services.findByTeamId.mockReturnValue([]);
  mockFetch.mockResolvedValue({
    success: true,
    data: { version: 1, services: [] },
    url: 'https://example.com/manifest.json',
  });
  mockValidate.mockReturnValue({
    valid: true, version: 1, service_count: 0, valid_count: 0,
    errors: [], warnings: [],
  });
  mockDiff.mockReturnValue({
    toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
    unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
  });
}

// --- Tests ---

describe('ManifestSyncService', () => {
  let stores: ReturnType<typeof createMockStores>;
  let service: ManifestSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    stores = createMockStores();
    // Wire up mockTxStores to point to the same mocks
    Object.assign(mockTxStores, stores);
    service = createSyncService(stores);

    // Default SSRF validation passes
    mockSsrfValidate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // =========================================================================
  // syncTeam — early returns
  // =========================================================================
  describe('syncTeam — early returns', () => {
    it('returns failed if config not found', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(undefined);
      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Manifest config not found');
    });

    it('returns failed if config is disabled', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig({ is_enabled: 0 }));
      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Manifest sync is disabled for this team');
    });

    it('returns failed if fetch fails', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      mockFetch.mockResolvedValue({
        success: false, error: 'HTTP 404: Not Found', url: 'https://example.com/manifest.json',
      });
      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('failed');
      expect(result.errors).toContain('HTTP 404: Not Found');
    });

    it('returns failed if validation fails', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      mockFetch.mockResolvedValue({
        success: true, data: { version: 2 }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: false, version: null, service_count: 0, valid_count: 0,
        errors: [{ severity: 'error', path: 'version', message: 'Unsupported version' }],
        warnings: [],
      });
      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('failed');
      expect(result.errors[0]).toContain('Unsupported version');
    });
  });

  // =========================================================================
  // syncTeam — success
  // =========================================================================
  describe('syncTeam — success', () => {
    it('completes successfully with empty manifest', async () => {
      setupEmptyManifestSync(stores);
      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('success');
      expect(result.summary.services.created).toBe(0);
      expect(stores.manifestConfig.updateSyncResult).toHaveBeenCalled();
      expect(stores.manifestSyncHistory.create).toHaveBeenCalled();
    });

    it('creates new services from diff.toCreate', async () => {
      const entry = { key: 'new-svc', name: 'New Service', health_endpoint: 'https://new.example.com/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [entry], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('success');
      expect(result.summary.services.created).toBe(1);
      expect(result.changes[0].action).toBe('created');
      expect(stores.services.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Service', team_id: 'team-1' }),
      );
    });

    it('produces detailed error on service creation FOREIGN KEY constraint', async () => {
      const entry = { key: 'new-svc', name: 'New Service', health_endpoint: 'https://new.example.com/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.services.create.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [entry], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('failed');
      expect(result.errors[0]).toContain('missing reference');
      expect(result.errors[0]).toContain('team-1');
    });

    it('updates services from diff.toUpdate', async () => {
      const entry = { key: 'svc-a', name: 'Updated Name', health_endpoint: 'https://svc-a.example.com/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [],
        toUpdate: [{ manifest_entry: entry, existing_service_id: 'svc-1', fields_changed: ['name'] }],
        toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.services.updated).toBe(1);
      expect(result.changes[0].fields_changed).toEqual(['name']);
    });

    it('upserts drift flags for diff.toDrift', async () => {
      const driftEntry = {
        manifest_entry: { key: 'svc-a', name: 'Service A', health_endpoint: 'https://new.example.com/health' },
        existing_service_id: 'svc-1',
        field_name: 'health_endpoint',
        manifest_value: 'https://new.example.com/health',
        current_value: 'https://old.example.com/health',
      };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [driftEntry.manifest_entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [driftEntry], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.services.drift_flagged).toBe(1);
      expect(stores.driftFlags.upsertFieldDrift).toHaveBeenCalledWith(
        'svc-1', 'health_endpoint',
        'https://new.example.com/health', 'https://old.example.com/health',
        null,
      );
    });

    it('deactivates services from diff.toDeactivate', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      stores.services.findById.mockReturnValue(makeService());
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: ['svc-1'], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.services.deactivated).toBe(1);
      expect(stores.services.update).toHaveBeenCalledWith('svc-1', { is_active: false });
      expect(mockPollingService.stopService).toHaveBeenCalledWith('svc-1');
    });

    it('deletes services from diff.toDelete', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      stores.services.findById.mockReturnValue(makeService());
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: ['svc-1'], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.services.deleted).toBe(1);
      expect(stores.services.delete).toHaveBeenCalledWith('svc-1');
      expect(mockPollingService.stopService).toHaveBeenCalledWith('svc-1');
    });

    it('records unchanged services', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      stores.services.findById.mockReturnValue(makeService());
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [{ key: 'svc-a', name: 'Service A', health_endpoint: 'https://svc-a.example.com/health' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-1'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.services.unchanged).toBe(1);
    });
  });

  // =========================================================================
  // SSRF filtering
  // =========================================================================
  describe('SSRF filtering', () => {
    it('skips creating services with SSRF-blocked endpoints', async () => {
      const entry = { key: 'bad-svc', name: 'Bad', health_endpoint: 'https://10.0.0.1/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockSsrfValidate.mockRejectedValue(new Error('Private address'));
      mockDiff.mockReturnValue({
        toCreate: [entry], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('success');
      expect(stores.services.create).not.toHaveBeenCalled();
      expect(result.warnings.some(w => w.includes('private address'))).toBe(true);
    });
  });

  // =========================================================================
  // Events
  // =========================================================================
  describe('events', () => {
    it('emits SYNC_COMPLETE on success', async () => {
      const listener = jest.fn();
      service.on(ManifestSyncEventType.SYNC_COMPLETE, listener);
      setupEmptyManifestSync(stores);
      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1' }));
    });

    it('emits DRIFT_DETECTED when drift flags are created', async () => {
      const listener = jest.fn();
      service.on(ManifestSyncEventType.DRIFT_DETECTED, listener);
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      stores.services.findById.mockReturnValue(makeService());
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: ['svc-1'],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1', driftCount: 1 }));
    });

    it('emits SYNC_ERROR on exception', async () => {
      const listener = jest.fn();
      service.on(ManifestSyncEventType.SYNC_ERROR, listener);
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1', error: 'Network failure' }));
    });
  });

  // =========================================================================
  // Concurrency
  // =========================================================================
  describe('concurrency', () => {
    it('canManualSync returns true when no recent sync', () => {
      expect(service.canManualSync('team-1').allowed).toBe(true);
    });

    it('canManualSync returns false within cooldown', async () => {
      setupEmptyManifestSync(stores);
      await service.syncTeam('team-1', 'manual', 'user-1');
      const cooldown = service.canManualSync('team-1');
      expect(cooldown.allowed).toBe(false);
      expect(cooldown.retryAfterMs).toBeGreaterThan(0);
    });

    it('isSyncing returns false when no sync in progress', () => {
      expect(service.isSyncing('team-1')).toBe(false);
    });
  });

  // =========================================================================
  // Sync policy parsing
  // =========================================================================
  describe('sync policy', () => {
    it('uses DEFAULT_SYNC_POLICY when sync_policy is null', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig({ sync_policy: null }));
      stores.services.findByTeamId.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockDiff).toHaveBeenCalledWith([], [], expect.objectContaining(DEFAULT_SYNC_POLICY));
    });

    it('parses custom sync_policy from JSON', async () => {
      const custom: ManifestSyncPolicy = {
        on_field_drift: 'manifest_wins', on_removal: 'deactivate',
        on_alias_removal: 'remove', on_override_removal: 'remove', on_association_removal: 'remove',
      };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig({ sync_policy: JSON.stringify(custom) }));
      stores.services.findByTeamId.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockDiff).toHaveBeenCalledWith([], [], expect.objectContaining(custom));
    });

    it('falls back to DEFAULT_SYNC_POLICY on invalid JSON', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig({ sync_policy: 'not-json' }));
      stores.services.findByTeamId.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockDiff).toHaveBeenCalledWith([], [], expect.objectContaining(DEFAULT_SYNC_POLICY));
    });
  });

  // =========================================================================
  // Polling integration
  // =========================================================================
  describe('polling integration', () => {
    it('restarts polling for updated services with endpoint changes', async () => {
      const entry = { key: 'svc-a', name: 'Service A', health_endpoint: 'https://new.example.com/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [],
        toUpdate: [{ manifest_entry: entry, existing_service_id: 'svc-1', fields_changed: ['health_endpoint'] }],
        toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockPollingService.restartService).toHaveBeenCalledWith('svc-1');
    });

    it('does not restart polling for name-only updates', async () => {
      const entry = { key: 'svc-a', name: 'Updated', health_endpoint: 'https://svc-a.example.com/health' };
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      mockFetch.mockResolvedValue({
        success: true, data: { version: 1, services: [entry] }, url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [],
        toUpdate: [{ manifest_entry: entry, existing_service_id: 'svc-1', fields_changed: ['name'] }],
        toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockPollingService.restartService).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Audit logging
  // =========================================================================
  describe('audit logging', () => {
    it('logs audit event on success with user context', async () => {
      setupEmptyManifestSync(stores);
      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', action: 'manifest_sync', resourceId: 'team-1' }),
      );
    });

    it('uses system user for scheduled syncs', async () => {
      setupEmptyManifestSync(stores);
      await service.syncTeam('team-1', 'scheduled', null);
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'system' }));
    });
  });

  // =========================================================================
  // Scheduling
  // =========================================================================
  describe('scheduling', () => {
    it('start() creates a scheduler interval', () => {
      service.start();
      expect(service.isSchedulerActive).toBe(true);
    });

    it('start() respects MANIFEST_SYNC_ENABLED=false', () => {
      const original = process.env.MANIFEST_SYNC_ENABLED;
      process.env.MANIFEST_SYNC_ENABLED = 'false';
      service.start();
      expect(service.isSchedulerActive).toBe(false);
      process.env.MANIFEST_SYNC_ENABLED = original;
    });

    it('start() is idempotent', () => {
      service.start();
      service.start();
      expect(service.isSchedulerActive).toBe(true);
    });
  });

  // =========================================================================
  // Shutdown
  // =========================================================================
  describe('shutdown', () => {
    it('stops the scheduler', async () => {
      service.start();
      expect(service.isSchedulerActive).toBe(true);
      await service.shutdown();
      expect(service.isSchedulerActive).toBe(false);
    });

    it('is safe to call multiple times', async () => {
      await service.shutdown();
      await service.shutdown();
    });
  });

  // =========================================================================
  // Alias sync
  // =========================================================================
  describe('alias sync', () => {
    it('creates team-scoped aliases from manifest', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.aliases.findAll.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [], aliases: [{ alias: 'pg', canonical_name: 'postgresql' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.aliases.created).toBe(1);
    });

    it('produces detailed error on alias UNIQUE constraint instead of crashing', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.aliases.findAll.mockReturnValue([]);

      // Make the raw DB INSERT throw a UNIQUE constraint error
      const dbRun = jest.fn().mockImplementation(() => {
        throw new Error('UNIQUE constraint failed: dependency_aliases.alias');
      });
      stores.aliases.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [], aliases: [{ alias: 'pg', canonical_name: 'postgresql' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('partial');
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Alias "pg"');
      expect(result.errors[0]).toContain('postgresql');
      expect(result.errors[0]).toContain('unique');
    });

    it('produces detailed error on alias FOREIGN KEY constraint', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.aliases.findAll.mockReturnValue([]);

      const dbRun = jest.fn().mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });
      stores.aliases.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [], aliases: [{ alias: 'pg', canonical_name: 'postgresql' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('partial');
      expect(result.errors[0]).toContain('Alias "pg"');
      expect(result.errors[0]).toContain('team no longer exists');
    });
  });

  // =========================================================================
  // Override sync
  // =========================================================================
  describe('override sync', () => {
    it('creates team-scoped overrides from manifest', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.canonicalOverrides.findAll.mockReturnValue([]);
      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [], canonical_overrides: [{ canonical_name: 'pg', impact: 'High' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.summary.overrides.created).toBe(1);
      expect(stores.canonicalOverrides.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ canonical_name: 'pg', team_id: 'team-1', manifest_managed: 1 }),
      );
    });

    it('produces detailed error on override FOREIGN KEY constraint', async () => {
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([]);
      stores.canonicalOverrides.findAll.mockReturnValue([]);
      stores.canonicalOverrides.upsert.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [], canonical_overrides: [{ canonical_name: 'pg', impact: 'High' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 0, valid_count: 0, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: [], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('partial');
      expect(result.errors[0]).toContain('Override "pg"');
      expect(result.errors[0]).toContain('team or user no longer exists');
    });
  });

  // =========================================================================
  // Auto-resolve stale removal drift
  // =========================================================================
  describe('auto-resolve stale drift', () => {
    it('resolves removal drift when service is back in manifest', async () => {
      const removalDrift = {
        id: 'drift-1', service_id: 'svc-1', drift_type: 'service_removal' as const,
        status: 'pending' as const, field_name: null, team_id: 'team-1',
        manifest_value: null, current_value: null,
        first_detected_at: '2026-01-01T00:00:00.000Z', last_detected_at: '2026-01-01T00:00:00.000Z',
        resolved_at: null, resolved_by: null, sync_history_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
      };
      stores.driftFlags.findActiveByServiceId.mockReturnValue([removalDrift]);
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([makeService()]);
      stores.services.findById.mockReturnValue(makeService());
      mockFetch.mockResolvedValue({
        success: true,
        data: { version: 1, services: [{ key: 'svc-a', name: 'Service A', health_endpoint: 'https://svc-a.example.com/health' }] },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-1'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      await service.syncTeam('team-1', 'manual', 'user-1');
      expect(stores.driftFlags.resolve).toHaveBeenCalledWith('drift-1', 'resolved', null);
    });
  });

  // =========================================================================
  // Cross-team association sync
  // =========================================================================
  describe('cross-team association sync', () => {
    it('resolves linked service by manifest_key across teams', async () => {
      const localService = makeService({ id: 'svc-local', name: 'Gateway', manifest_key: 'gateway', manifest_managed: 1, team_id: 'team-1' });
      const remoteService = makeService({ id: 'svc-remote', name: 'Payment API', manifest_key: 'payment-api', manifest_managed: 1, team_id: 'team-2' });
      const dep = { id: 'dep-1', service_id: 'svc-local', name: 'payment-api', canonical_name: null };

      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([localService]);
      stores.services.findAll.mockReturnValue([localService, remoteService]);
      stores.dependencies.findByServiceId.mockReturnValue([dep]);
      stores.associations.findByDependencyId.mockReturnValue([]);

      const dbRun = jest.fn();
      stores.associations.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'payment-api', linked_service_key: 'team-two/payment-api', association_type: 'api_call' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-local'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(stores.associations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency_id: 'dep-1',
          linked_service_id: 'svc-remote',
          association_type: 'api_call',
        }),
      );
      expect(result.summary.associations.created).toBe(1);
    });

    it('skips association when linked_service_key has no global match', async () => {
      const localService = makeService({ id: 'svc-local', name: 'Gateway', manifest_key: 'gateway', manifest_managed: 1, team_id: 'team-1' });
      const dep = { id: 'dep-1', service_id: 'svc-local', name: 'pg-main', canonical_name: null };

      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([localService]);
      stores.services.findAll.mockReturnValue([localService]);
      stores.dependencies.findByServiceId.mockReturnValue([dep]);
      stores.associations.findByDependencyId.mockReturnValue([]);

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'pg-main', linked_service_key: 'team-two/nonexistent-key', association_type: 'database' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-local'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(stores.associations.create).not.toHaveBeenCalled();
      expect(result.summary.associations.created).toBe(0);
    });

    it('resolves by linked_service_key independently of dependency_name', async () => {
      const localService = makeService({ id: 'svc-local', name: 'Gateway', manifest_key: 'gateway', manifest_managed: 1, team_id: 'team-1' });
      const remoteService = makeService({ id: 'svc-remote', name: 'PostgreSQL DB', manifest_key: 'postgres-db', manifest_managed: 1, team_id: 'team-2' });
      const dep = { id: 'dep-1', service_id: 'svc-local', name: 'pg-main', canonical_name: null };

      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([localService]);
      stores.services.findAll.mockReturnValue([localService, remoteService]);
      stores.dependencies.findByServiceId.mockReturnValue([dep]);
      stores.associations.findByDependencyId.mockReturnValue([]);

      const dbRun = jest.fn();
      stores.associations.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'pg-main', linked_service_key: 'team-two/postgres-db', association_type: 'database' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-local'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(stores.associations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency_id: 'dep-1',
          linked_service_id: 'svc-remote',
          association_type: 'database',
        }),
      );
      expect(result.summary.associations.created).toBe(1);
    });

    it('adopts existing non-manifest-managed association instead of creating a duplicate', async () => {
      const localService = makeService({ id: 'svc-local', name: 'Gateway', manifest_key: 'gateway', manifest_managed: 1, team_id: 'team-1' });
      const remoteService = makeService({ id: 'svc-remote', name: 'Payment API', manifest_key: 'payment-api', manifest_managed: 1, team_id: 'team-2' });
      const dep = { id: 'dep-1', service_id: 'svc-local', name: 'payment-api', canonical_name: null };

      // Existing non-manifest-managed association (e.g. created manually)
      const existingAssoc = {
        id: 'assoc-existing',
        dependency_id: 'dep-1',
        linked_service_id: 'svc-remote',
        association_type: 'api_call',
        manifest_managed: 0,
      };

      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([localService]);
      stores.services.findAll.mockReturnValue([localService, remoteService]);
      stores.dependencies.findByServiceId.mockReturnValue([dep]);
      stores.associations.findByDependencyId.mockReturnValue([existingAssoc]);

      const dbRun = jest.fn();
      stores.associations.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'payment-api', linked_service_key: 'team-two/payment-api', association_type: 'api_call' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-local'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');

      // Should NOT call create — would cause UNIQUE constraint violation
      expect(stores.associations.create).not.toHaveBeenCalled();

      // Should adopt existing association by updating it to manifest_managed
      expect(dbRun).toHaveBeenCalledWith('api_call', 'assoc-existing');
      expect(result.summary.associations.created).toBe(1);
    });

    it('counts existing manifest-managed association as unchanged', async () => {
      const localService = makeService({ id: 'svc-local', name: 'Gateway', manifest_key: 'gateway', manifest_managed: 1, team_id: 'team-1' });
      const remoteService = makeService({ id: 'svc-remote', name: 'Payment API', manifest_key: 'payment-api', manifest_managed: 1, team_id: 'team-2' });
      const dep = { id: 'dep-1', service_id: 'svc-local', name: 'payment-api', canonical_name: null };

      // Existing manifest-managed association (from previous sync)
      const existingAssoc = {
        id: 'assoc-existing',
        dependency_id: 'dep-1',
        linked_service_id: 'svc-remote',
        association_type: 'api_call',
        manifest_managed: 1,
      };

      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([localService]);
      stores.services.findAll.mockReturnValue([localService, remoteService]);
      stores.dependencies.findByServiceId.mockReturnValue([dep]);
      stores.associations.findByDependencyId.mockReturnValue([existingAssoc]);

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'payment-api', linked_service_key: 'team-two/payment-api', association_type: 'api_call' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-local'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');

      expect(stores.associations.create).not.toHaveBeenCalled();
      expect(result.summary.associations.unchanged).toBe(1);
      expect(result.summary.associations.created).toBe(0);
    });

    it('produces detailed error on association FOREIGN KEY constraint', async () => {
      const existingService = makeService({ id: 'svc-gw', name: 'Gateway', manifest_key: 'gateway' });
      const linkedService = makeService({ id: 'svc-pay', name: 'Payment', team_id: 'team-2', manifest_key: 'payment-api' });
      stores.manifestConfig.findByTeamId.mockReturnValue(makeConfig());
      stores.services.findByTeamId.mockReturnValue([existingService]);
      stores.services.findAll.mockReturnValue([existingService, linkedService]);
      stores.dependencies.findByServiceId.mockReturnValue([
        { id: 'dep-1', service_id: 'svc-gw', name: 'payment-api', canonical_name: 'payment-api' },
      ]);
      stores.associations.findByDependencyId.mockReturnValue([]);
      stores.associations.create.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });

      const dbRun = jest.fn();
      stores.associations.db = { prepare: jest.fn().mockReturnValue({ run: dbRun }) };

      mockFetch.mockResolvedValue({
        success: true,
        data: {
          version: 1,
          services: [{ key: 'gateway', name: 'Gateway', health_endpoint: 'https://gw.example.com/health' }],
          associations: [{ service_key: 'gateway', dependency_name: 'payment-api', linked_service_key: 'team-two/payment-api', association_type: 'api_call' }],
        },
        url: 'https://example.com/manifest.json',
      });
      mockValidate.mockReturnValue({
        valid: true, version: 1, service_count: 1, valid_count: 1, errors: [], warnings: [],
      });
      mockDiff.mockReturnValue({
        toCreate: [], toUpdate: [], toDrift: [], toKeepLocal: [],
        unchanged: ['svc-gw'], toDeactivate: [], toDelete: [], removalDrift: [],
      });

      const result = await service.syncTeam('team-1', 'manual', 'user-1');
      expect(result.status).toBe('partial');
      expect(result.errors[0]).toContain('gateway');
      expect(result.errors[0]).toContain('payment-api');
      expect(result.errors[0]).toContain('dependency or linked service was removed');
    });
  });
});
