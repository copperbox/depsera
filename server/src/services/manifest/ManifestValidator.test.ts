import { validateManifest } from './ManifestValidator';
import { ManifestValidationResult } from './types';

// Helper to build a minimal valid manifest
function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    services: [
      {
        key: 'svc-a',
        name: 'Service A',
        health_endpoint: 'https://svc-a.example.com/health',
      },
    ],
    ...overrides,
  };
}

// Helper to build a minimal valid service entry
function validService(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'my-service',
    name: 'My Service',
    health_endpoint: 'https://my-service.example.com/health',
    ...overrides,
  };
}

describe('ManifestValidator', () => {
  // =========================================================================
  // Level 1: Manifest Structure
  // =========================================================================
  describe('Level 1 — Manifest Structure', () => {
    it('accepts a minimal valid manifest', () => {
      const result = validateManifest(validManifest());
      expect(result.valid).toBe(true);
      expect(result.version).toBe(1);
      expect(result.service_count).toBe(1);
      expect(result.valid_count).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts an empty services array', () => {
      const result = validateManifest({ version: 1, services: [] });
      expect(result.valid).toBe(true);
      expect(result.service_count).toBe(0);
      expect(result.valid_count).toBe(0);
    });

    it('rejects non-object input (string)', () => {
      const result = validateManifest('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: '', message: expect.stringContaining('JSON object') })]),
      );
    });

    it('rejects null input', () => {
      const result = validateManifest(null);
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateManifest([]);
      expect(result.valid).toBe(false);
    });

    it('rejects missing version', () => {
      const result = validateManifest({ services: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'version', message: expect.stringContaining('required') })]),
      );
    });

    it('rejects version !== 1', () => {
      const result = validateManifest({ version: 2, services: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'version', message: expect.stringContaining('Unsupported') })]),
      );
    });

    it('rejects version: 0', () => {
      const result = validateManifest({ version: 0, services: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects version: "1" (string)', () => {
      const result = validateManifest({ version: '1', services: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects missing services', () => {
      const result = validateManifest({ version: 1 });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services' })]),
      );
    });

    it('rejects services: {} (non-array)', () => {
      const result = validateManifest({ version: 1, services: {} });
      expect(result.valid).toBe(false);
    });

    it('warns on unknown top-level keys', () => {
      const result = validateManifest({ version: 1, services: [], metadata: 'extra', foo: 'bar' });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'metadata', severity: 'warning' }),
          expect.objectContaining({ path: 'foo', severity: 'warning' }),
        ]),
      );
    });

    it('does not warn on known optional top-level keys', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [],
        canonical_overrides: [],
        associations: [],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // =========================================================================
  // Level 2: Per-Service Entry Validation
  // =========================================================================
  describe('Level 2 — Per-Service Entry Validation', () => {
    it('accepts a fully-specified service entry', () => {
      const result = validateManifest({
        version: 1,
        services: [
          {
            key: 'full-svc',
            name: 'Full Service',
            health_endpoint: 'https://full.example.com/health',
            description: 'A fully specified service',
            metrics_endpoint: 'https://full.example.com/metrics',
            poll_interval_ms: 60000,
            schema_config: { root: 'deps', fields: { name: 'name', healthy: 'ok' } },
          },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.valid_count).toBe(1);
    });

    it('rejects non-object service entry', () => {
      const result = validateManifest({ version: 1, services: ['not-an-object'] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0]' })]),
      );
    });

    // --- key ---
    it('rejects missing key', () => {
      const result = validateManifest({ version: 1, services: [validService({ key: undefined })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].key' })]),
      );
    });

    it('rejects empty key', () => {
      const result = validateManifest({ version: 1, services: [validService({ key: '' })] });
      expect(result.valid).toBe(false);
    });

    it('rejects key with uppercase letters', () => {
      const result = validateManifest({ version: 1, services: [validService({ key: 'MyService' })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].key', message: expect.stringContaining('pattern') })]),
      );
    });

    it('rejects key starting with hyphen', () => {
      const result = validateManifest({ version: 1, services: [validService({ key: '-start' })] });
      expect(result.valid).toBe(false);
    });

    it('rejects key starting with underscore', () => {
      const result = validateManifest({ version: 1, services: [validService({ key: '_start' })] });
      expect(result.valid).toBe(false);
    });

    it('accepts valid key patterns', () => {
      const keys = ['a', 'svc-1', 'my_service', '0svc', 'a-b-c', 'a_b_c'];
      for (const key of keys) {
        const result = validateManifest({ version: 1, services: [validService({ key })] });
        expect(result.errors.filter(e => e.path.includes('.key'))).toHaveLength(0);
      }
    });

    it('rejects key exceeding 128 characters', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'a'.repeat(129) })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].key', message: expect.stringContaining('128') })]),
      );
    });

    it('accepts key at exactly 128 characters', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'a'.repeat(128) })],
      });
      expect(result.errors.filter(e => e.path === 'services[0].key')).toHaveLength(0);
    });

    // --- name ---
    it('rejects missing name', () => {
      const result = validateManifest({ version: 1, services: [validService({ name: undefined })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].name' })]),
      );
    });

    // --- health_endpoint ---
    it('rejects missing health_endpoint', () => {
      const result = validateManifest({ version: 1, services: [validService({ health_endpoint: undefined })] });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid health_endpoint URL', () => {
      const result = validateManifest({ version: 1, services: [validService({ health_endpoint: 'not-a-url' })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].health_endpoint', message: expect.stringContaining('URL') })]),
      );
    });

    it('rejects ftp:// health_endpoint', () => {
      const result = validateManifest({ version: 1, services: [validService({ health_endpoint: 'ftp://files.example.com' })] });
      expect(result.valid).toBe(false);
    });

    it('warns on SSRF-blocked health_endpoint hostname', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ health_endpoint: 'http://127.0.0.1/health' })],
      });
      // Should have a warning about private address
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'services[0].health_endpoint', message: expect.stringContaining('private') }),
        ]),
      );
    });

    // --- description ---
    it('accepts null description', () => {
      const result = validateManifest({ version: 1, services: [validService({ description: null })] });
      expect(result.errors.filter(e => e.path.includes('description'))).toHaveLength(0);
    });

    it('rejects non-string description', () => {
      const result = validateManifest({ version: 1, services: [validService({ description: 123 })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].description' })]),
      );
    });

    // --- metrics_endpoint ---
    it('accepts valid metrics_endpoint', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ metrics_endpoint: 'https://example.com/metrics' })],
      });
      expect(result.errors.filter(e => e.path.includes('metrics_endpoint'))).toHaveLength(0);
    });

    it('rejects invalid metrics_endpoint URL', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ metrics_endpoint: 'bad-url' })],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects empty metrics_endpoint string', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ metrics_endpoint: '' })],
      });
      expect(result.valid).toBe(false);
    });

    // --- poll_interval_ms ---
    it('accepts valid poll_interval_ms at boundaries', () => {
      const lower = validateManifest({ version: 1, services: [validService({ poll_interval_ms: 5000 })] });
      const upper = validateManifest({ version: 1, services: [validService({ poll_interval_ms: 3600000 })] });
      expect(lower.errors.filter(e => e.path.includes('poll_interval_ms'))).toHaveLength(0);
      expect(upper.errors.filter(e => e.path.includes('poll_interval_ms'))).toHaveLength(0);
    });

    it('rejects poll_interval_ms below minimum', () => {
      const result = validateManifest({ version: 1, services: [validService({ poll_interval_ms: 4999 })] });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].poll_interval_ms' })]),
      );
    });

    it('rejects poll_interval_ms above maximum', () => {
      const result = validateManifest({ version: 1, services: [validService({ poll_interval_ms: 3600001 })] });
      expect(result.valid).toBe(false);
    });

    it('rejects non-integer poll_interval_ms', () => {
      const result = validateManifest({ version: 1, services: [validService({ poll_interval_ms: 10000.5 })] });
      expect(result.valid).toBe(false);
    });

    it('rejects string poll_interval_ms', () => {
      const result = validateManifest({ version: 1, services: [validService({ poll_interval_ms: '30000' })] });
      expect(result.valid).toBe(false);
    });

    // --- schema_config ---
    it('accepts valid schema_config object', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({
            schema_config: { root: 'deps', fields: { name: 'name', healthy: 'ok' } },
          }),
        ],
      });
      expect(result.errors.filter(e => e.path.includes('schema_config'))).toHaveLength(0);
    });

    it('rejects invalid schema_config (missing root)', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ schema_config: { fields: { name: 'name', healthy: 'ok' } } })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'services[0].schema_config' })]),
      );
    });

    it('rejects invalid schema_config (missing required fields)', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ schema_config: { root: 'deps', fields: {} } })],
      });
      expect(result.valid).toBe(false);
    });

    // --- unknown fields ---
    it('warns on unknown service fields', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ extra_field: 'value', another: 123 })],
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'services[0].extra_field', severity: 'warning' }),
          expect.objectContaining({ path: 'services[0].another', severity: 'warning' }),
        ]),
      );
    });
  });

  // =========================================================================
  // Level 2/3: Aliases Validation
  // =========================================================================
  describe('Aliases Validation', () => {
    it('accepts valid aliases', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [
          { alias: 'my-db', canonical_name: 'postgresql' },
          { alias: 'cache', canonical_name: 'redis' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('skips aliases when not present', () => {
      const result = validateManifest({ version: 1, services: [] });
      expect(result.valid).toBe(true);
    });

    it('rejects aliases that is not an array', () => {
      const result = validateManifest({ version: 1, services: [], aliases: 'not-array' });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'aliases' })]),
      );
    });

    it('rejects alias entry missing alias field', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [{ canonical_name: 'redis' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'aliases[0].alias' })]),
      );
    });

    it('rejects alias entry missing canonical_name', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [{ alias: 'cache' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'aliases[0].canonical_name' })]),
      );
    });

    it('rejects duplicate alias values', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [
          { alias: 'my-db', canonical_name: 'postgresql' },
          { alias: 'my-db', canonical_name: 'mysql' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'aliases[1].alias', message: expect.stringContaining('Duplicate') })]),
      );
    });

    it('rejects non-object alias entry', () => {
      const result = validateManifest({ version: 1, services: [], aliases: ['string'] });
      expect(result.valid).toBe(false);
    });

    it('warns on unknown alias fields', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [{ alias: 'cache', canonical_name: 'redis', extra: 'value' }],
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'aliases[0].extra' })]),
      );
    });
  });

  // =========================================================================
  // Level 2/3: Canonical Overrides Validation
  // =========================================================================
  describe('Canonical Overrides Validation', () => {
    it('accepts valid overrides with contact object', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [
          { canonical_name: 'postgresql', contact: { email: 'dba@example.com' } },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts valid overrides with impact string', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [
          { canonical_name: 'redis', impact: 'Low - cache layer only' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts valid overrides with both contact and impact', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [
          { canonical_name: 'postgresql', contact: { team: 'db-team' }, impact: 'Critical' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects override missing canonical_name', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ contact: { email: 'test@test.com' } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'canonical_overrides[0].canonical_name' })]),
      );
    });

    it('rejects override with neither contact nor impact', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ canonical_name: 'postgresql' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'canonical_overrides[0]', message: expect.stringContaining('contact or impact') })]),
      );
    });

    it('rejects contact that is not an object', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ canonical_name: 'pg', contact: 'not-object' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'canonical_overrides[0].contact' })]),
      );
    });

    it('rejects contact that is an array', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ canonical_name: 'pg', contact: ['bad'] }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects impact that is not a string', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ canonical_name: 'pg', impact: 123 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'canonical_overrides[0].impact' })]),
      );
    });

    it('rejects duplicate canonical_name', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [
          { canonical_name: 'postgresql', impact: 'High' },
          { canonical_name: 'postgresql', impact: 'Low' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('Duplicate') })]),
      );
    });

    it('rejects non-array canonical_overrides', () => {
      const result = validateManifest({ version: 1, services: [], canonical_overrides: {} });
      expect(result.valid).toBe(false);
    });

    it('warns on unknown override fields', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        canonical_overrides: [{ canonical_name: 'pg', impact: 'High', extra: 'field' }],
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'canonical_overrides[0].extra' })]),
      );
    });
  });

  // =========================================================================
  // Level 2/3: Associations Validation
  // =========================================================================
  describe('Associations Validation', () => {
    it('accepts valid associations referencing known service keys', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'my-service' })],
        associations: [
          { service_key: 'my-service', dependency_name: 'postgresql', linked_service_key: 'data-team/postgres-db', association_type: 'database' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts all valid association types', () => {
      const types = ['api_call', 'database', 'message_queue', 'cache', 'other'];
      for (const type of types) {
        const result = validateManifest({
          version: 1,
          services: [validService({ key: 'svc' })],
          associations: [{ service_key: 'svc', dependency_name: `dep-${type}`, linked_service_key: `other-team/target-${type}`, association_type: type }],
        });
        expect(result.errors.filter(e => e.path.includes('association_type'))).toHaveLength(0);
      }
    });

    it('rejects invalid association_type', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'invalid' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].association_type' })]),
      );
    });

    it('rejects missing service_key', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        associations: [{ dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].service_key' })]),
      );
    });

    it('rejects missing dependency_name', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', linked_service_key: 'other-team/target', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing linked_service_key', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].linked_service_key' })]),
      );
    });

    it('rejects empty linked_service_key', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: '', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].linked_service_key' })]),
      );
    });

    it('rejects linked_service_key without team_key/service_key format', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'plain-key', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].linked_service_key', message: expect.stringContaining('team_key/service_key') })]),
      );
    });

    it('rejects linked_service_key with invalid team key portion', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'INVALID/service-key', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].linked_service_key' })]),
      );
    });

    it('rejects linked_service_key with invalid service key portion', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'team-key/INVALID', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].linked_service_key' })]),
      );
    });

    it('rejects missing association_type', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects service_key not in services array', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc-a' })],
        associations: [{ service_key: 'svc-b', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'associations[0].service_key',
            message: expect.stringContaining('does not match'),
          }),
        ]),
      );
    });

    it('allows linked_service_key not in services array (cross-team)', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/other-team-service', association_type: 'api_call' }],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects duplicate association tuples', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database' },
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[1]', message: expect.stringContaining('Duplicate') })]),
      );
    });

    it('rejects same service+dep+linked_service_key with different association_type as duplicate', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database' },
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'cache' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[1]', message: expect.stringContaining('Duplicate') })]),
      );
    });

    it('allows same service+dep with different linked_service_key', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target-a', association_type: 'database' },
          { service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target-b', association_type: 'database' },
        ],
      });
      expect(result.errors.filter(e => e.message.includes('Duplicate'))).toHaveLength(0);
    });

    it('rejects non-array associations', () => {
      const result = validateManifest({ version: 1, services: [], associations: {} });
      expect(result.valid).toBe(false);
    });

    it('warns on unknown association fields', () => {
      const result = validateManifest({
        version: 1,
        services: [validService({ key: 'svc' })],
        associations: [{ service_key: 'svc', dependency_name: 'dep', linked_service_key: 'other-team/target', association_type: 'database', extra: true }],
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'associations[0].extra' })]),
      );
    });
  });

  // =========================================================================
  // Level 3: Cross-Reference Checks
  // =========================================================================
  describe('Level 3 — Cross-Reference Checks', () => {
    it('rejects duplicate service keys', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({ key: 'dup-key', name: 'Service 1' }),
          validService({ key: 'dup-key', name: 'Service 2' }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'services[1].key',
            message: expect.stringContaining('Duplicate key'),
          }),
        ]),
      );
    });

    it('warns on duplicate service names', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({ key: 'svc-a', name: 'Same Name' }),
          validService({ key: 'svc-b', name: 'Same Name' }),
        ],
      });
      // Duplicate names are warnings, not errors
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'services[1].name',
            severity: 'warning',
            message: expect.stringContaining('Duplicate name'),
          }),
        ]),
      );
    });

    it('duplicate names do not cause validation failure', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({ key: 'svc-a', name: 'Same Name' }),
          validService({ key: 'svc-b', name: 'Same Name' }),
        ],
      });
      // Only warnings, no errors about names
      expect(result.errors.filter(e => e.path.includes('.name'))).toHaveLength(0);
    });
  });

  // =========================================================================
  // Result shape
  // =========================================================================
  describe('Result shape', () => {
    it('returns correct counts for mixed valid/invalid entries', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({ key: 'good-1', name: 'Good 1' }),
          validService({ key: 'good-2', name: 'Good 2' }),
          { key: 'bad', name: 123 }, // invalid: missing health_endpoint, name not string
        ],
      });
      expect(result.service_count).toBe(3);
      expect(result.valid_count).toBe(2);
    });

    it('includes both errors and warnings in the result', () => {
      const result = validateManifest({
        version: 1,
        services: [
          { key: 'BAD-KEY', name: 'Svc', health_endpoint: 'https://example.com/health', extra: true },
        ],
      });
      expect(result.errors.length).toBeGreaterThan(0); // bad key
      expect(result.warnings.length).toBeGreaterThan(0); // unknown field
    });

    it('all issues have required fields', () => {
      const result = validateManifest({
        version: 1,
        services: [{ key: 'BAD' }],
        aliases: [{ alias: '' }],
      });
      for (const issue of [...result.errors, ...result.warnings]) {
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('path');
        expect(issue).toHaveProperty('message');
        expect(['error', 'warning']).toContain(issue.severity);
      }
    });
  });

  // =========================================================================
  // Section independence
  // =========================================================================
  describe('Section independence', () => {
    it('validates aliases even when services have errors', () => {
      const result = validateManifest({
        version: 1,
        services: [{ key: 'BAD' }], // invalid service
        aliases: [{ alias: '', canonical_name: 'pg' }], // invalid alias
      });
      // Both sections should have errors
      const serviceErrors = result.errors.filter(e => e.path.startsWith('services'));
      const aliasErrors = result.errors.filter(e => e.path.startsWith('aliases'));
      expect(serviceErrors.length).toBeGreaterThan(0);
      expect(aliasErrors.length).toBeGreaterThan(0);
    });

    it('validates canonical_overrides even when aliases have errors', () => {
      const result = validateManifest({
        version: 1,
        services: [],
        aliases: [{ alias: '' }],
        canonical_overrides: [{ canonical_name: '' }],
      });
      const aliasErrors = result.errors.filter(e => e.path.startsWith('aliases'));
      const overrideErrors = result.errors.filter(e => e.path.startsWith('canonical_overrides'));
      expect(aliasErrors.length).toBeGreaterThan(0);
      expect(overrideErrors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('Edge cases', () => {
    it('handles a manifest with many services efficiently', () => {
      const services = Array.from({ length: 100 }, (_, i) => ({
        key: `svc-${i}`,
        name: `Service ${i}`,
        health_endpoint: `https://svc-${i}.example.com/health`,
      }));
      const result = validateManifest({ version: 1, services });
      expect(result.valid).toBe(true);
      expect(result.service_count).toBe(100);
      expect(result.valid_count).toBe(100);
    });

    it('handles null aliases gracefully', () => {
      const result = validateManifest({ version: 1, services: [], aliases: null });
      expect(result.valid).toBe(true);
    });

    it('handles null canonical_overrides gracefully', () => {
      const result = validateManifest({ version: 1, services: [], canonical_overrides: null });
      expect(result.valid).toBe(true);
    });

    it('handles null associations gracefully', () => {
      const result = validateManifest({ version: 1, services: [], associations: null });
      expect(result.valid).toBe(true);
    });

    it('handles schema_config as JSON string', () => {
      const result = validateManifest({
        version: 1,
        services: [
          validService({
            schema_config: JSON.stringify({ root: 'deps', fields: { name: 'name', healthy: 'ok' } }),
          }),
        ],
      });
      expect(result.errors.filter(e => e.path.includes('schema_config'))).toHaveLength(0);
    });
  });
});
