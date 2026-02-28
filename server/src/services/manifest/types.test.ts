import {
  DEFAULT_SYNC_POLICY,
  ManifestSyncPolicy,
  FieldDriftPolicy,
  RemovalPolicy,
  MetadataRemovalPolicy,
  TeamManifestConfig,
  ManifestConfigCreateInput,
  ManifestConfigUpdateInput,
  ManifestServiceEntry,
  ManifestAliasEntry,
  ManifestCanonicalOverrideEntry,
  ManifestAssociationEntry,
  ParsedManifest,
  ManifestValidationResult,
  ManifestValidationIssue,
  ManifestSyncSummary,
  ManifestSyncResult,
  ManifestSyncChange,
  ManifestDiffResult,
  ManifestUpdateEntry,
  ManifestDriftEntry,
  ManifestSyncHistoryEntry,
  ManifestFetchResult,
} from './types';

import {
  DriftFlag,
  DriftFlagWithContext,
  DriftFlagCreateInput,
  DriftSummary,
  DriftType,
  DriftFlagStatus,
  DriftFlagUpsertResult,
  BulkDriftActionInput,
  BulkDriftActionResult,
  Service,
  DependencyAlias,
  DependencyCanonicalOverride,
  DependencyAssociation,
} from '../../db/types';

describe('Manifest types', () => {
  describe('DEFAULT_SYNC_POLICY', () => {
    it('has the expected default values', () => {
      expect(DEFAULT_SYNC_POLICY).toEqual({
        on_field_drift: 'flag',
        on_removal: 'flag',
        on_alias_removal: 'keep',
        on_override_removal: 'keep',
        on_association_removal: 'keep',
      });
    });

    it('satisfies ManifestSyncPolicy interface', () => {
      const policy: ManifestSyncPolicy = DEFAULT_SYNC_POLICY;
      expect(policy.on_field_drift).toBe('flag');
      expect(policy.on_removal).toBe('flag');
      expect(policy.on_alias_removal).toBe('keep');
      expect(policy.on_override_removal).toBe('keep');
      expect(policy.on_association_removal).toBe('keep');
    });
  });

  describe('Policy type aliases', () => {
    it('FieldDriftPolicy accepts valid values', () => {
      const values: FieldDriftPolicy[] = ['flag', 'manifest_wins', 'local_wins'];
      expect(values).toHaveLength(3);
    });

    it('RemovalPolicy accepts valid values', () => {
      const values: RemovalPolicy[] = ['flag', 'deactivate', 'delete'];
      expect(values).toHaveLength(3);
    });

    it('MetadataRemovalPolicy accepts valid values', () => {
      const values: MetadataRemovalPolicy[] = ['remove', 'keep'];
      expect(values).toHaveLength(2);
    });
  });

  describe('TeamManifestConfig', () => {
    it('can construct a valid config object', () => {
      const config: TeamManifestConfig = {
        id: 'config-1',
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
        is_enabled: 1,
        sync_policy: JSON.stringify(DEFAULT_SYNC_POLICY),
        last_sync_at: null,
        last_sync_status: null,
        last_sync_error: null,
        last_sync_summary: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(config.id).toBe('config-1');
      expect(config.is_enabled).toBe(1);
      expect(config.sync_policy).not.toBeNull();
    });
  });

  describe('ManifestConfigCreateInput', () => {
    it('requires team_id and manifest_url', () => {
      const input: ManifestConfigCreateInput = {
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      };
      expect(input.team_id).toBe('team-1');
      expect(input.is_enabled).toBeUndefined();
      expect(input.sync_policy).toBeUndefined();
    });

    it('accepts optional fields', () => {
      const input: ManifestConfigCreateInput = {
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
        is_enabled: false,
        sync_policy: { ...DEFAULT_SYNC_POLICY, on_field_drift: 'manifest_wins' },
      };
      expect(input.is_enabled).toBe(false);
      expect(input.sync_policy?.on_field_drift).toBe('manifest_wins');
    });
  });

  describe('ManifestConfigUpdateInput', () => {
    it('all fields are optional', () => {
      const input: ManifestConfigUpdateInput = {};
      expect(input.manifest_url).toBeUndefined();
    });

    it('accepts partial sync_policy', () => {
      const input: ManifestConfigUpdateInput = {
        sync_policy: { on_field_drift: 'local_wins' },
      };
      expect(input.sync_policy?.on_field_drift).toBe('local_wins');
      expect(input.sync_policy?.on_removal).toBeUndefined();
    });
  });

  describe('ParsedManifest', () => {
    it('can construct a full manifest', () => {
      const service: ManifestServiceEntry = {
        key: 'my-service',
        name: 'My Service',
        health_endpoint: 'https://my-service.local/health',
        description: 'A test service',
        poll_interval_ms: 30000,
      };

      const alias: ManifestAliasEntry = {
        alias: 'my-db',
        canonical_name: 'postgresql',
      };

      const override: ManifestCanonicalOverrideEntry = {
        canonical_name: 'postgresql',
        contact: { email: 'dba@example.com' },
        impact: 'Critical',
      };

      const association: ManifestAssociationEntry = {
        service_key: 'my-service',
        dependency_name: 'postgresql',
        association_type: 'database',
      };

      const manifest: ParsedManifest = {
        version: 1,
        services: [service],
        aliases: [alias],
        canonical_overrides: [override],
        associations: [association],
      };

      expect(manifest.version).toBe(1);
      expect(manifest.services).toHaveLength(1);
      expect(manifest.aliases).toHaveLength(1);
      expect(manifest.canonical_overrides).toHaveLength(1);
      expect(manifest.associations).toHaveLength(1);
    });

    it('allows optional sections to be omitted', () => {
      const manifest: ParsedManifest = {
        version: 1,
        services: [],
      };
      expect(manifest.aliases).toBeUndefined();
      expect(manifest.canonical_overrides).toBeUndefined();
      expect(manifest.associations).toBeUndefined();
    });
  });

  describe('ManifestValidationResult', () => {
    it('can represent a valid result', () => {
      const result: ManifestValidationResult = {
        valid: true,
        version: 1,
        service_count: 5,
        valid_count: 5,
        errors: [],
        warnings: [],
      };
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('can represent a failed result with issues', () => {
      const issue: ManifestValidationIssue = {
        severity: 'error',
        path: 'services[0].key',
        message: 'key is required',
      };
      const result: ManifestValidationResult = {
        valid: false,
        version: 1,
        service_count: 3,
        valid_count: 2,
        errors: [issue],
        warnings: [{ severity: 'warning', path: 'services[1].name', message: 'duplicate name' }],
      };
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe('ManifestSyncResult', () => {
    it('can represent a successful sync', () => {
      const summary: ManifestSyncSummary = {
        services: { created: 2, updated: 1, deactivated: 0, deleted: 0, drift_flagged: 1, unchanged: 5 },
        aliases: { created: 1, updated: 0, removed: 0, unchanged: 3 },
        overrides: { created: 0, updated: 1, removed: 0, unchanged: 2 },
        associations: { created: 1, removed: 0, unchanged: 4 },
      };

      const change: ManifestSyncChange = {
        manifest_key: 'new-svc',
        service_name: 'New Service',
        action: 'created',
      };

      const result: ManifestSyncResult = {
        status: 'success',
        summary,
        errors: [],
        warnings: ['Duplicate service name detected'],
        changes: [change],
        duration_ms: 1234,
      };

      expect(result.status).toBe('success');
      expect(result.summary.services.created).toBe(2);
      expect(result.changes).toHaveLength(1);
    });
  });

  describe('ManifestDiffResult', () => {
    it('can represent a diff with all categories', () => {
      const newEntry: ManifestServiceEntry = {
        key: 'new-svc',
        name: 'New Service',
        health_endpoint: 'https://new.local/health',
      };

      const updateEntry: ManifestUpdateEntry = {
        manifest_entry: { key: 'existing', name: 'Updated', health_endpoint: 'https://e.local/health' },
        existing_service_id: 'svc-1',
        fields_changed: ['name'],
      };

      const driftEntry: ManifestDriftEntry = {
        manifest_entry: { key: 'drifted', name: 'Drifted', health_endpoint: 'https://d.local/health' },
        existing_service_id: 'svc-2',
        field_name: 'name',
        manifest_value: 'Drifted',
        current_value: 'Manually Changed',
      };

      const diff: ManifestDiffResult = {
        toCreate: [newEntry],
        toUpdate: [updateEntry],
        toDrift: [driftEntry],
        toKeepLocal: [],
        unchanged: ['svc-3'],
        toDeactivate: [],
        toDelete: [],
        removalDrift: ['svc-4'],
      };

      expect(diff.toCreate).toHaveLength(1);
      expect(diff.toUpdate).toHaveLength(1);
      expect(diff.toDrift).toHaveLength(1);
      expect(diff.removalDrift).toHaveLength(1);
    });
  });

  describe('ManifestSyncHistoryEntry', () => {
    it('can represent a manual sync', () => {
      const entry: ManifestSyncHistoryEntry = {
        id: 'hist-1',
        team_id: 'team-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        manifest_url: 'https://example.com/manifest.json',
        status: 'success',
        summary: JSON.stringify({ services: { created: 1 } }),
        errors: null,
        warnings: null,
        duration_ms: 500,
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(entry.trigger_type).toBe('manual');
      expect(entry.triggered_by).toBe('user-1');
    });

    it('can represent a scheduled sync with null triggered_by', () => {
      const entry: ManifestSyncHistoryEntry = {
        id: 'hist-2',
        team_id: 'team-1',
        trigger_type: 'scheduled',
        triggered_by: null,
        manifest_url: 'https://example.com/manifest.json',
        status: 'failed',
        summary: null,
        errors: JSON.stringify(['Network timeout']),
        warnings: null,
        duration_ms: 10000,
        created_at: '2026-01-01T01:00:00Z',
      };
      expect(entry.triggered_by).toBeNull();
      expect(entry.status).toBe('failed');
    });
  });

  describe('ManifestFetchResult', () => {
    it('can represent a success', () => {
      const result: ManifestFetchResult = {
        success: true,
        data: { version: 1, services: [] },
        url: 'https://example.com/manifest.json',
      };
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
      }
    });

    it('can represent a failure', () => {
      const result: ManifestFetchResult = {
        success: false,
        error: 'Network timeout',
        url: 'https://example.com/manifest.json',
      };
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Network timeout');
      }
    });
  });
});

describe('Drift flag types (db/types.ts)', () => {
  describe('DriftFlag', () => {
    it('can construct a field_change drift flag', () => {
      const flag: DriftFlag = {
        id: 'drift-1',
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'New Name',
        current_value: 'Old Name',
        status: 'pending',
        first_detected_at: '2026-01-01T00:00:00Z',
        last_detected_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        resolved_by: null,
        sync_history_id: 'hist-1',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(flag.drift_type).toBe('field_change');
      expect(flag.field_name).toBe('name');
    });

    it('can construct a service_removal drift flag', () => {
      const flag: DriftFlag = {
        id: 'drift-2',
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
        field_name: null,
        manifest_value: null,
        current_value: null,
        status: 'pending',
        first_detected_at: '2026-01-01T00:00:00Z',
        last_detected_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        resolved_by: null,
        sync_history_id: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(flag.drift_type).toBe('service_removal');
      expect(flag.field_name).toBeNull();
    });
  });

  describe('DriftFlagWithContext', () => {
    it('extends DriftFlag with service and user context', () => {
      const flag: DriftFlagWithContext = {
        id: 'drift-1',
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'New',
        current_value: 'Old',
        status: 'dismissed',
        first_detected_at: '2026-01-01T00:00:00Z',
        last_detected_at: '2026-01-01T00:00:00Z',
        resolved_at: '2026-01-02T00:00:00Z',
        resolved_by: 'user-1',
        sync_history_id: null,
        created_at: '2026-01-01T00:00:00Z',
        service_name: 'My Service',
        manifest_key: 'my-service',
        resolved_by_name: 'Alice',
      };
      expect(flag.service_name).toBe('My Service');
      expect(flag.manifest_key).toBe('my-service');
      expect(flag.resolved_by_name).toBe('Alice');
    });
  });

  describe('DriftFlagCreateInput', () => {
    it('requires team_id, service_id, and drift_type', () => {
      const input: DriftFlagCreateInput = {
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'New',
        current_value: 'Old',
      };
      expect(input.drift_type).toBe('field_change');
    });

    it('allows optional fields to be omitted', () => {
      const input: DriftFlagCreateInput = {
        team_id: 'team-1',
        service_id: 'svc-1',
        drift_type: 'service_removal',
      };
      expect(input.field_name).toBeUndefined();
      expect(input.manifest_value).toBeUndefined();
    });
  });

  describe('DriftSummary', () => {
    it('holds badge counts', () => {
      const summary: DriftSummary = {
        pending_count: 5,
        dismissed_count: 2,
        field_change_pending: 3,
        service_removal_pending: 2,
      };
      expect(summary.pending_count).toBe(5);
      expect(summary.field_change_pending + summary.service_removal_pending).toBe(5);
    });
  });

  describe('DriftType and DriftFlagStatus', () => {
    it('DriftType covers expected values', () => {
      const types: DriftType[] = ['field_change', 'service_removal'];
      expect(types).toHaveLength(2);
    });

    it('DriftFlagStatus covers expected values', () => {
      const statuses: DriftFlagStatus[] = ['pending', 'dismissed', 'accepted', 'resolved'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('DriftFlagUpsertResult', () => {
    it('can represent a created result', () => {
      const flag: DriftFlag = {
        id: 'drift-1', team_id: 'team-1', service_id: 'svc-1', drift_type: 'field_change',
        field_name: 'name', manifest_value: 'New', current_value: 'Old', status: 'pending',
        first_detected_at: '2026-01-01T00:00:00Z', last_detected_at: '2026-01-01T00:00:00Z',
        resolved_at: null, resolved_by: null, sync_history_id: null, created_at: '2026-01-01T00:00:00Z',
      };
      const result: DriftFlagUpsertResult = { action: 'created', flag };
      expect(result.action).toBe('created');
    });

    it('can represent an updated result', () => {
      const flag: DriftFlag = {
        id: 'drift-1', team_id: 'team-1', service_id: 'svc-1', drift_type: 'field_change',
        field_name: 'name', manifest_value: 'Newer', current_value: 'Old', status: 'pending',
        first_detected_at: '2026-01-01T00:00:00Z', last_detected_at: '2026-01-02T00:00:00Z',
        resolved_at: null, resolved_by: null, sync_history_id: null, created_at: '2026-01-01T00:00:00Z',
      };
      const result: DriftFlagUpsertResult = { action: 'updated', flag };
      expect(result.action).toBe('updated');
    });

    it('can represent a reopened result', () => {
      const flag: DriftFlag = {
        id: 'drift-1', team_id: 'team-1', service_id: 'svc-1', drift_type: 'field_change',
        field_name: 'name', manifest_value: 'Changed Again', current_value: 'Old', status: 'pending',
        first_detected_at: '2026-01-01T00:00:00Z', last_detected_at: '2026-01-03T00:00:00Z',
        resolved_at: null, resolved_by: null, sync_history_id: null, created_at: '2026-01-01T00:00:00Z',
      };
      const result: DriftFlagUpsertResult = { action: 'reopened', flag };
      expect(result.action).toBe('reopened');
    });
  });

  describe('BulkDriftActionInput and BulkDriftActionResult', () => {
    it('can construct input', () => {
      const input: BulkDriftActionInput = {
        flag_ids: ['drift-1', 'drift-2', 'drift-3'],
        user_id: 'user-1',
      };
      expect(input.flag_ids).toHaveLength(3);
    });

    it('can construct a result with partial failures', () => {
      const result: BulkDriftActionResult = {
        succeeded: 2,
        failed: 1,
        errors: [{ flag_id: 'drift-3', error: 'Flag not found' }],
      };
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
});

describe('Updated existing types with manifest columns', () => {
  describe('Service', () => {
    it('includes manifest columns', () => {
      const service: Service = {
        id: 'svc-1',
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'https://test.local/health',
        metrics_endpoint: null,
        schema_config: null,
        poll_interval_ms: 30000,
        is_active: 1,
        is_external: 0,
        description: null,
        last_poll_success: null,
        last_poll_error: null,
        poll_warnings: null,
        manifest_key: 'test-svc',
        manifest_managed: 1,
        manifest_last_synced_values: JSON.stringify({ name: 'Test', health_endpoint: 'https://test.local/health' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(service.manifest_key).toBe('test-svc');
      expect(service.manifest_managed).toBe(1);
      expect(service.manifest_last_synced_values).not.toBeNull();
    });

    it('allows null manifest columns for non-managed services', () => {
      const service: Service = {
        id: 'svc-2',
        name: 'Manual',
        team_id: 'team-1',
        health_endpoint: 'https://manual.local/health',
        metrics_endpoint: null,
        schema_config: null,
        poll_interval_ms: 30000,
        is_active: 1,
        is_external: 0,
        description: null,
        last_poll_success: null,
        last_poll_error: null,
        poll_warnings: null,
        manifest_key: null,
        manifest_managed: 0,
        manifest_last_synced_values: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(service.manifest_key).toBeNull();
      expect(service.manifest_managed).toBe(0);
    });
  });

  describe('DependencyAlias', () => {
    it('includes manifest_team_id column', () => {
      const alias: DependencyAlias = {
        id: 'alias-1',
        alias: 'my-db',
        canonical_name: 'postgresql',
        manifest_team_id: 'team-1',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(alias.manifest_team_id).toBe('team-1');
    });

    it('allows null manifest_team_id for non-manifest aliases', () => {
      const alias: DependencyAlias = {
        id: 'alias-2',
        alias: 'cache',
        canonical_name: 'redis',
        manifest_team_id: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(alias.manifest_team_id).toBeNull();
    });
  });

  describe('DependencyCanonicalOverride', () => {
    it('includes team_id and manifest_managed columns', () => {
      const override: DependencyCanonicalOverride = {
        id: 'override-1',
        canonical_name: 'postgresql',
        team_id: 'team-1',
        contact_override: '{"email":"dba@example.com"}',
        impact_override: 'Critical',
        manifest_managed: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
      };
      expect(override.team_id).toBe('team-1');
      expect(override.manifest_managed).toBe(1);
    });

    it('allows null team_id for global overrides', () => {
      const override: DependencyCanonicalOverride = {
        id: 'override-2',
        canonical_name: 'redis',
        team_id: null,
        contact_override: null,
        impact_override: 'Low',
        manifest_managed: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: 'user-1',
      };
      expect(override.team_id).toBeNull();
      expect(override.manifest_managed).toBe(0);
    });
  });

  describe('DependencyAssociation', () => {
    it('includes manifest_managed column', () => {
      const assoc: DependencyAssociation = {
        id: 'assoc-1',
        dependency_id: 'dep-1',
        linked_service_id: 'svc-2',
        association_type: 'api_call',
        is_auto_suggested: 0,
        confidence_score: null,
        is_dismissed: 0,
        match_reason: null,
        manifest_managed: 1,
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(assoc.manifest_managed).toBe(1);
    });
  });
});
