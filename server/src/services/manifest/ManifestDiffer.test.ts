import { Service } from '../../db/types';
import {
  ManifestServiceEntry,
  ManifestSyncPolicy,
  DEFAULT_SYNC_POLICY,
} from './types';
import { diffManifest } from './ManifestDiffer';

// --- Helpers ---

function makeManifestEntry(
  overrides: Partial<ManifestServiceEntry> = {},
): ManifestServiceEntry {
  return {
    key: 'svc-a',
    name: 'Service A',
    health_endpoint: 'https://svc-a.example.com/health',
    ...overrides,
  };
}

function makeService(
  overrides: Partial<Service> = {},
): Service {
  return {
    id: 'svc-id-1',
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

function makePolicy(
  overrides: Partial<ManifestSyncPolicy> = {},
): ManifestSyncPolicy {
  return { ...DEFAULT_SYNC_POLICY, ...overrides };
}

/** Helper to build the JSON snapshot of last synced values. */
function lastSynced(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe('ManifestDiffer', () => {
  // =========================================================================
  // New Services
  // =========================================================================
  describe('new services (no match)', () => {
    it('adds entries with no matching DB service to toCreate', () => {
      const entries = [makeManifestEntry({ key: 'new-svc' })];
      const result = diffManifest(entries, [], makePolicy());

      expect(result.toCreate).toHaveLength(1);
      expect(result.toCreate[0].key).toBe('new-svc');
      expect(result.toUpdate).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
    });

    it('handles multiple new services', () => {
      const entries = [
        makeManifestEntry({ key: 'svc-1', name: 'One' }),
        makeManifestEntry({ key: 'svc-2', name: 'Two' }),
      ];
      const result = diffManifest(entries, [], makePolicy());

      expect(result.toCreate).toHaveLength(2);
    });
  });

  // =========================================================================
  // Unchanged Services
  // =========================================================================
  describe('unchanged services', () => {
    it('identifies services where all fields match', () => {
      const entry = makeManifestEntry();
      const existing = makeService();
      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.unchanged).toEqual(['svc-id-1']);
      expect(result.toCreate).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.toDrift).toHaveLength(0);
    });

    it('treats undefined optional manifest fields as no-op (not a diff)', () => {
      // Manifest doesn't specify description, metrics_endpoint, poll_interval_ms, schema_config
      const entry = makeManifestEntry();
      const existing = makeService({
        description: 'Some description',
        metrics_endpoint: 'https://metrics.example.com',
        poll_interval_ms: 60000,
        schema_config: '{"status_field":"status"}',
      });

      const result = diffManifest([entry], [existing], makePolicy());

      // These fields are undefined in the manifest → not compared → no diff
      expect(result.unchanged).toEqual(['svc-id-1']);
    });
  });

  // =========================================================================
  // First Sync (manifest_last_synced_values is NULL)
  // =========================================================================
  describe('first sync', () => {
    it('treats all changed fields as safe to update on first sync', () => {
      const entry = makeManifestEntry({
        name: 'Updated Name',
        description: 'New desc',
      });
      const existing = makeService({
        name: 'Old Name',
        description: null,
        manifest_last_synced_values: null, // first sync
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toContain('name');
      expect(result.toUpdate[0].fields_changed).toContain('description');
      expect(result.toDrift).toHaveLength(0);
    });

    it('does not apply drift policy on first sync even if values differ', () => {
      const entry = makeManifestEntry({ name: 'Manifest Name' });
      const existing = makeService({
        name: 'Manually Edited Name',
        manifest_last_synced_values: null,
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'flag' }),
      );

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toDrift).toHaveLength(0);
    });
  });

  // =========================================================================
  // Safe Updates (no manual edits)
  // =========================================================================
  describe('safe updates (DB matches last synced)', () => {
    it('adds to toUpdate when DB value matches last synced value', () => {
      const entry = makeManifestEntry({ name: 'New Name' });
      const existing = makeService({
        name: 'Old Name',
        manifest_last_synced_values: lastSynced({
          name: 'Old Name',
          health_endpoint: 'https://svc-a.example.com/health',
        }),
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toEqual(['name']);
      expect(result.toUpdate[0].existing_service_id).toBe('svc-id-1');
      expect(result.toDrift).toHaveLength(0);
    });

    it('groups multiple safe field changes into one update entry', () => {
      const entry = makeManifestEntry({
        name: 'New Name',
        health_endpoint: 'https://new.example.com/health',
        description: 'New desc',
      });
      const existing = makeService({
        name: 'Old Name',
        health_endpoint: 'https://old.example.com/health',
        description: 'Old desc',
        manifest_last_synced_values: lastSynced({
          name: 'Old Name',
          health_endpoint: 'https://old.example.com/health',
          description: 'Old desc',
        }),
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toEqual(
        expect.arrayContaining(['name', 'health_endpoint', 'description']),
      );
    });
  });

  // =========================================================================
  // Drift Detection — flag policy
  // =========================================================================
  describe('drift detection (on_field_drift = flag)', () => {
    it('flags drifted fields when DB was manually edited', () => {
      const entry = makeManifestEntry({ name: 'Manifest Name' });
      const existing = makeService({
        name: 'Manually Edited',
        manifest_last_synced_values: lastSynced({
          name: 'Original Synced',
          health_endpoint: 'https://svc-a.example.com/health',
        }),
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'flag' }),
      );

      expect(result.toDrift).toHaveLength(1);
      expect(result.toDrift[0].field_name).toBe('name');
      expect(result.toDrift[0].manifest_value).toBe('Manifest Name');
      expect(result.toDrift[0].current_value).toBe('Manually Edited');
      expect(result.toUpdate).toHaveLength(0);
    });

    it('creates separate drift entries per drifted field', () => {
      const entry = makeManifestEntry({
        name: 'M-Name',
        health_endpoint: 'https://m.example.com/health',
      });
      const existing = makeService({
        name: 'Edited Name',
        health_endpoint: 'https://edited.example.com/health',
        manifest_last_synced_values: lastSynced({
          name: 'Synced Name',
          health_endpoint: 'https://synced.example.com/health',
        }),
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'flag' }),
      );

      expect(result.toDrift).toHaveLength(2);
      expect(result.toDrift.map((d) => d.field_name)).toEqual(
        expect.arrayContaining(['name', 'health_endpoint']),
      );
    });
  });

  // =========================================================================
  // Drift Detection — manifest_wins policy
  // =========================================================================
  describe('drift detection (on_field_drift = manifest_wins)', () => {
    it('treats drifted fields as safe to update', () => {
      const entry = makeManifestEntry({ name: 'Manifest Name' });
      const existing = makeService({
        name: 'Manually Edited',
        manifest_last_synced_values: lastSynced({
          name: 'Original Synced',
          health_endpoint: 'https://svc-a.example.com/health',
        }),
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'manifest_wins' }),
      );

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toContain('name');
      expect(result.toDrift).toHaveLength(0);
    });
  });

  // =========================================================================
  // Drift Detection — local_wins policy
  // =========================================================================
  describe('drift detection (on_field_drift = local_wins)', () => {
    it('adds drifted fields to toKeepLocal', () => {
      const entry = makeManifestEntry({ name: 'Manifest Name' });
      const existing = makeService({
        name: 'Manually Edited',
        manifest_last_synced_values: lastSynced({
          name: 'Original Synced',
          health_endpoint: 'https://svc-a.example.com/health',
        }),
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'local_wins' }),
      );

      expect(result.toKeepLocal).toHaveLength(1);
      expect(result.toKeepLocal[0].field_name).toBe('name');
      expect(result.toUpdate).toHaveLength(0);
      expect(result.toDrift).toHaveLength(0);
    });
  });

  // =========================================================================
  // Mixed Fields (some safe, some drifted)
  // =========================================================================
  describe('mixed fields', () => {
    it('splits a service into toUpdate and toDrift when fields are mixed', () => {
      const entry = makeManifestEntry({
        name: 'New Name',
        health_endpoint: 'https://new.example.com/health',
      });
      const existing = makeService({
        name: 'Manually Edited Name',
        health_endpoint: 'https://old.example.com/health',
        manifest_last_synced_values: lastSynced({
          name: 'Synced Name', // DB ≠ synced → manual edit
          health_endpoint: 'https://old.example.com/health', // DB === synced → safe
        }),
      });

      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_field_drift: 'flag' }),
      );

      // health_endpoint is safe to update
      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toEqual(['health_endpoint']);

      // name is drifted
      expect(result.toDrift).toHaveLength(1);
      expect(result.toDrift[0].field_name).toBe('name');
    });
  });

  // =========================================================================
  // Removed Services
  // =========================================================================
  describe('removed services', () => {
    it('flags removal when on_removal = flag', () => {
      const existing = makeService({ manifest_key: 'gone-svc', id: 'gone-id' });
      const result = diffManifest(
        [], // manifest has no entries
        [existing],
        makePolicy({ on_removal: 'flag' }),
      );

      expect(result.removalDrift).toEqual(['gone-id']);
      expect(result.toDeactivate).toHaveLength(0);
      expect(result.toDelete).toHaveLength(0);
    });

    it('deactivates when on_removal = deactivate', () => {
      const existing = makeService({ manifest_key: 'gone-svc', id: 'gone-id' });
      const result = diffManifest(
        [],
        [existing],
        makePolicy({ on_removal: 'deactivate' }),
      );

      expect(result.toDeactivate).toEqual(['gone-id']);
      expect(result.removalDrift).toHaveLength(0);
    });

    it('deletes when on_removal = delete', () => {
      const existing = makeService({ manifest_key: 'gone-svc', id: 'gone-id' });
      const result = diffManifest(
        [],
        [existing],
        makePolicy({ on_removal: 'delete' }),
      );

      expect(result.toDelete).toEqual(['gone-id']);
      expect(result.removalDrift).toHaveLength(0);
    });

    it('does not remove services that are still in the manifest', () => {
      const entry = makeManifestEntry({ key: 'svc-a' });
      const existing = makeService({ manifest_key: 'svc-a' });
      const result = diffManifest(
        [entry],
        [existing],
        makePolicy({ on_removal: 'delete' }),
      );

      expect(result.toDelete).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
      expect(result.removalDrift).toHaveLength(0);
    });
  });

  // =========================================================================
  // schema_config comparison
  // =========================================================================
  describe('schema_config comparison', () => {
    it('detects schema_config changes via JSON serialization', () => {
      const entry = makeManifestEntry({
        schema_config: { status_field: 'status', name_field: 'name' },
      });
      const existing = makeService({
        schema_config: '{"status_field":"health"}',
        manifest_last_synced_values: lastSynced({
          name: 'Service A',
          health_endpoint: 'https://svc-a.example.com/health',
          schema_config: '{"status_field":"health"}',
        }),
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toContain('schema_config');
    });

    it('treats identical schema_config as unchanged', () => {
      const entry = makeManifestEntry({
        schema_config: { status_field: 'health' },
      });
      const existing = makeService({
        schema_config: '{"status_field":"health"}',
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.unchanged).toEqual(['svc-id-1']);
    });
  });

  // =========================================================================
  // poll_interval_ms comparison
  // =========================================================================
  describe('poll_interval_ms comparison', () => {
    it('detects poll_interval_ms changes (number vs number)', () => {
      const entry = makeManifestEntry({ poll_interval_ms: 60000 });
      const existing = makeService({
        poll_interval_ms: 30000,
        manifest_last_synced_values: lastSynced({
          name: 'Service A',
          health_endpoint: 'https://svc-a.example.com/health',
          poll_interval_ms: 30000,
        }),
      });

      const result = diffManifest([entry], [existing], makePolicy());

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].fields_changed).toContain('poll_interval_ms');
    });
  });

  // =========================================================================
  // Complex scenario: multiple services, mixed outcomes
  // =========================================================================
  describe('complex scenarios', () => {
    it('handles a mix of new, unchanged, updated, drifted, and removed', () => {
      const entries = [
        makeManifestEntry({ key: 'new-svc', name: 'Brand New' }),
        makeManifestEntry({ key: 'unchanged', name: 'Unchanged Svc' }),
        makeManifestEntry({ key: 'updated', name: 'Updated Name' }),
        makeManifestEntry({ key: 'drifted', name: 'Manifest Name' }),
      ];

      const existing = [
        makeService({
          id: 'id-unchanged',
          manifest_key: 'unchanged',
          name: 'Unchanged Svc',
        }),
        makeService({
          id: 'id-updated',
          manifest_key: 'updated',
          name: 'Old Name',
          manifest_last_synced_values: lastSynced({
            name: 'Old Name',
            health_endpoint: 'https://svc-a.example.com/health',
          }),
        }),
        makeService({
          id: 'id-drifted',
          manifest_key: 'drifted',
          name: 'User Edited',
          manifest_last_synced_values: lastSynced({
            name: 'Originally Synced',
            health_endpoint: 'https://svc-a.example.com/health',
          }),
        }),
        makeService({
          id: 'id-removed',
          manifest_key: 'removed-svc',
          name: 'Removed',
        }),
      ];

      const result = diffManifest(entries, existing, makePolicy({ on_field_drift: 'flag' }));

      expect(result.toCreate).toHaveLength(1);
      expect(result.toCreate[0].key).toBe('new-svc');

      expect(result.unchanged).toEqual(['id-unchanged']);

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].existing_service_id).toBe('id-updated');

      expect(result.toDrift).toHaveLength(1);
      expect(result.toDrift[0].existing_service_id).toBe('id-drifted');

      expect(result.removalDrift).toEqual(['id-removed']);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles empty manifest and empty DB', () => {
      const result = diffManifest([], [], makePolicy());
      expect(result.toCreate).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.removalDrift).toHaveLength(0);
    });

    it('handles corrupt manifest_last_synced_values (treats as first sync)', () => {
      const entry = makeManifestEntry({ name: 'New Name' });
      const existing = makeService({
        name: 'Old Name',
        manifest_last_synced_values: 'not-valid-json',
      });

      const result = diffManifest([entry], [existing], makePolicy());

      // Corrupt JSON → treated as first sync → safe update
      expect(result.toUpdate).toHaveLength(1);
      expect(result.toDrift).toHaveLength(0);
    });

    it('skips services without manifest_key in existing services', () => {
      const entry = makeManifestEntry({ key: 'svc-a' });
      const existing = makeService({ manifest_key: null });

      const result = diffManifest([entry], [existing], makePolicy());

      // Entry should be treated as new (no match since existing has no manifest_key)
      expect(result.toCreate).toHaveLength(1);
      // Existing without manifest_key is not treated as removed
      expect(result.removalDrift).toHaveLength(0);
    });

    it('handles null DB values compared to empty manifest values', () => {
      const entry = makeManifestEntry({ description: '' });
      const existing = makeService({
        description: null,
        manifest_last_synced_values: lastSynced({ description: null }),
      });

      // null (DB) normalizes to '' and manifest '' normalizes to ''
      // So they should match
      const result = diffManifest([entry], [existing], makePolicy());

      // description: DB null → '' and manifest '' → '' → no diff for this field
      // But name and health_endpoint match too → unchanged
      expect(result.unchanged).toEqual(['svc-id-1']);
    });
  });
});
