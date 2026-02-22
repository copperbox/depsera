import {
  isValidUrl,
  validateEndpointUrl,
  isNonEmptyString,
  isString,
  isNumber,
  isBoolean,
  validateServiceCreate,
  validateServiceUpdate,
  validateAssociationCreate,
  validateTeamCreate,
  validateTeamUpdate,
  validateTeamMemberAdd,
  validateTeamMemberRoleUpdate,
  validateDependencyType,
  validateSchemaConfig,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  VALID_ASSOCIATION_TYPES,
  VALID_TEAM_MEMBER_ROLES,
} from './validation';
import { ValidationError } from './errors';
import { DEPENDENCY_TYPES } from '../db/types';
import { clearAllowlistCache } from './ssrf-allowlist';

describe('URL Validation', () => {
  describe('isValidUrl', () => {
    it('should accept valid http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should accept valid https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://api.example.com/health')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('validateEndpointUrl', () => {
    it('should accept valid public URLs', () => {
      expect(() => validateEndpointUrl('https://example.com/health', 'health_endpoint')).not.toThrow();
      expect(() => validateEndpointUrl('https://api.example.com:8080/health', 'health_endpoint')).not.toThrow();
    });

    it('should throw ValidationError for invalid URLs', () => {
      expect(() => validateEndpointUrl('not-a-url', 'health_endpoint')).toThrow(ValidationError);
      expect(() => validateEndpointUrl('ftp://example.com', 'health_endpoint')).toThrow(ValidationError);
    });

    it('should throw ValidationError for private IPs', () => {
      expect(() => validateEndpointUrl('http://127.0.0.1/health', 'health_endpoint')).toThrow(ValidationError);
      expect(() => validateEndpointUrl('http://192.168.1.1/health', 'health_endpoint')).toThrow(ValidationError);
      expect(() => validateEndpointUrl('http://10.0.0.1/health', 'health_endpoint')).toThrow(ValidationError);
      expect(() => validateEndpointUrl('http://169.254.169.254/meta-data', 'health_endpoint')).toThrow(ValidationError);
    });

    it('should throw ValidationError for localhost', () => {
      expect(() => validateEndpointUrl('http://localhost:3000/health', 'health_endpoint')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      try {
        validateEndpointUrl('http://127.0.0.1/health', 'my_field');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe('my_field');
      }
    });
  });

  describe('validateEndpointUrl with SSRF_ALLOWLIST', () => {
    const originalEnv = process.env.SSRF_ALLOWLIST;

    beforeEach(() => {
      clearAllowlistCache();
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SSRF_ALLOWLIST;
      } else {
        process.env.SSRF_ALLOWLIST = originalEnv;
      }
      clearAllowlistCache();
    });

    it('should allow localhost when allowlisted', () => {
      process.env.SSRF_ALLOWLIST = 'localhost,127.0.0.0/8';
      expect(() => validateEndpointUrl('http://localhost:3001/health', 'health_endpoint')).not.toThrow();
    });

    it('should allow private IPs when CIDR is allowlisted', () => {
      process.env.SSRF_ALLOWLIST = '192.168.0.0/16';
      expect(() => validateEndpointUrl('http://192.168.1.1/health', 'health_endpoint')).not.toThrow();
    });

    it('should still reject invalid URLs even with allowlist', () => {
      process.env.SSRF_ALLOWLIST = 'localhost';
      expect(() => validateEndpointUrl('not-a-url', 'health_endpoint')).toThrow(ValidationError);
    });

    it('should still block cloud metadata without explicit allowlist', () => {
      process.env.SSRF_ALLOWLIST = 'localhost,10.0.0.0/8';
      expect(() => validateEndpointUrl('http://169.254.169.254/meta-data', 'health_endpoint')).toThrow(ValidationError);
    });
  });
});

describe('Type Guards', () => {
  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  hello  ')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1.5)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });
});

describe('Service Validation', () => {
  describe('validateServiceCreate', () => {
    const validInput = {
      name: 'Test Service',
      team_id: 'team-123',
      health_endpoint: 'https://example.com/health',
    };

    it('should validate correct input', () => {
      const result = validateServiceCreate(validInput);
      expect(result.name).toBe('Test Service');
      expect(result.team_id).toBe('team-123');
      expect(result.health_endpoint).toBe('https://example.com/health');
    });

    it('should trim name', () => {
      const result = validateServiceCreate({ ...validInput, name: '  Test  ' });
      expect(result.name).toBe('Test');
    });

    it('should throw on missing name', () => {
      expect(() => validateServiceCreate({ ...validInput, name: undefined }))
        .toThrow(ValidationError);
    });

    it('should throw on empty name', () => {
      expect(() => validateServiceCreate({ ...validInput, name: '   ' }))
        .toThrow(ValidationError);
    });

    it('should throw on missing team_id', () => {
      expect(() => validateServiceCreate({ ...validInput, team_id: undefined }))
        .toThrow(ValidationError);
    });

    it('should throw on invalid team_id type', () => {
      expect(() => validateServiceCreate({ ...validInput, team_id: 123 }))
        .toThrow(ValidationError);
    });

    it('should throw on missing health_endpoint', () => {
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: undefined }))
        .toThrow(ValidationError);
    });

    it('should throw on invalid health_endpoint URL', () => {
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: 'not-a-url' }))
        .toThrow(ValidationError);
    });

    it('should throw on private IP health_endpoint (SSRF)', () => {
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: 'http://127.0.0.1/health' }))
        .toThrow(ValidationError);
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: 'http://192.168.1.1/health' }))
        .toThrow(ValidationError);
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: 'http://169.254.169.254/meta-data' }))
        .toThrow(ValidationError);
    });

    it('should throw on localhost health_endpoint (SSRF)', () => {
      expect(() => validateServiceCreate({ ...validInput, health_endpoint: 'http://localhost:3001/health' }))
        .toThrow(ValidationError);
    });

    it('should accept optional metrics_endpoint', () => {
      const result = validateServiceCreate({
        ...validInput,
        metrics_endpoint: 'https://example.com/metrics',
      });
      expect(result.metrics_endpoint).toBe('https://example.com/metrics');
    });

    it('should throw on invalid metrics_endpoint type', () => {
      expect(() => validateServiceCreate({ ...validInput, metrics_endpoint: 123 }))
        .toThrow(ValidationError);
    });

    it('should throw on invalid metrics_endpoint URL', () => {
      expect(() => validateServiceCreate({ ...validInput, metrics_endpoint: 'not-a-url' }))
        .toThrow(ValidationError);
    });

    it('should handle empty metrics_endpoint', () => {
      const result = validateServiceCreate({ ...validInput, metrics_endpoint: '' });
      expect(result.metrics_endpoint).toBeNull();
    });

    it('should accept optional poll_interval_ms', () => {
      const result = validateServiceCreate({ ...validInput, poll_interval_ms: 60000 });
      expect(result.poll_interval_ms).toBe(60000);
    });

    it('should throw on non-integer poll_interval_ms', () => {
      expect(() => validateServiceCreate({ ...validInput, poll_interval_ms: 'string' }))
        .toThrow(ValidationError);
      expect(() => validateServiceCreate({ ...validInput, poll_interval_ms: 60000.5 }))
        .toThrow(ValidationError);
    });

    it('should throw on poll_interval_ms below minimum', () => {
      expect(() => validateServiceCreate({ ...validInput, poll_interval_ms: 1000 }))
        .toThrow(ValidationError);
    });

    it('should throw on poll_interval_ms above maximum', () => {
      expect(() => validateServiceCreate({ ...validInput, poll_interval_ms: 5000000 }))
        .toThrow(ValidationError);
    });
  });

  describe('validateServiceUpdate', () => {
    it('should return null for empty input', () => {
      const result = validateServiceUpdate({});
      expect(result).toBeNull();
    });

    it('should validate name update', () => {
      const result = validateServiceUpdate({ name: 'New Name' });
      expect(result?.name).toBe('New Name');
    });

    it('should throw on empty name', () => {
      expect(() => validateServiceUpdate({ name: '  ' }))
        .toThrow(ValidationError);
    });

    it('should validate team_id update', () => {
      const result = validateServiceUpdate({ team_id: 'new-team' });
      expect(result?.team_id).toBe('new-team');
    });

    it('should throw on invalid team_id type', () => {
      expect(() => validateServiceUpdate({ team_id: 123 }))
        .toThrow(ValidationError);
    });

    it('should validate health_endpoint update', () => {
      const result = validateServiceUpdate({ health_endpoint: 'https://new.com/health' });
      expect(result?.health_endpoint).toBe('https://new.com/health');
    });

    it('should throw on invalid health_endpoint', () => {
      expect(() => validateServiceUpdate({ health_endpoint: 'invalid' }))
        .toThrow(ValidationError);
    });

    it('should validate metrics_endpoint update', () => {
      const result = validateServiceUpdate({ metrics_endpoint: 'https://new.com/metrics' });
      expect(result?.metrics_endpoint).toBe('https://new.com/metrics');
    });

    it('should allow null metrics_endpoint', () => {
      const result = validateServiceUpdate({ metrics_endpoint: null });
      expect(result?.metrics_endpoint).toBeNull();
    });

    it('should throw on invalid metrics_endpoint', () => {
      expect(() => validateServiceUpdate({ metrics_endpoint: 'invalid' }))
        .toThrow(ValidationError);
    });

    it('should validate poll_interval_ms update', () => {
      const result = validateServiceUpdate({ poll_interval_ms: 60000 });
      expect(result?.poll_interval_ms).toBe(60000);
    });

    it('should throw on invalid poll_interval_ms', () => {
      expect(() => validateServiceUpdate({ poll_interval_ms: 'string' }))
        .toThrow(ValidationError);
    });

    it('should validate is_active update', () => {
      const result = validateServiceUpdate({ is_active: false });
      expect(result?.is_active).toBe(false);
    });

    it('should throw on invalid is_active', () => {
      expect(() => validateServiceUpdate({ is_active: 'false' }))
        .toThrow(ValidationError);
    });
  });
});

describe('Association Validation', () => {
  describe('validateAssociationCreate', () => {
    it('should validate correct input', () => {
      const result = validateAssociationCreate({
        linked_service_id: 'svc-123',
        association_type: 'api_call',
      });
      expect(result.linked_service_id).toBe('svc-123');
      expect(result.association_type).toBe('api_call');
    });

    it('should throw on missing linked_service_id', () => {
      expect(() => validateAssociationCreate({ association_type: 'api_call' }))
        .toThrow(ValidationError);
    });

    it('should throw on invalid linked_service_id type', () => {
      expect(() => validateAssociationCreate({ linked_service_id: 123, association_type: 'api_call' }))
        .toThrow(ValidationError);
    });

    it('should throw on invalid association_type', () => {
      expect(() => validateAssociationCreate({
        linked_service_id: 'svc-123',
        association_type: 'invalid',
      })).toThrow(ValidationError);
    });

    it('should throw on missing association_type', () => {
      expect(() => validateAssociationCreate({ linked_service_id: 'svc-123' }))
        .toThrow(ValidationError);
    });
  });
});

describe('Team Validation', () => {
  describe('validateTeamCreate', () => {
    it('should validate correct input', () => {
      const result = validateTeamCreate({ name: 'Test Team' });
      expect(result.name).toBe('Test Team');
      expect(result.description).toBeNull();
    });

    it('should trim name', () => {
      const result = validateTeamCreate({ name: '  Team  ' });
      expect(result.name).toBe('Team');
    });

    it('should accept description', () => {
      const result = validateTeamCreate({ name: 'Team', description: 'A test team' });
      expect(result.description).toBe('A test team');
    });

    it('should handle empty description', () => {
      const result = validateTeamCreate({ name: 'Team', description: '' });
      expect(result.description).toBeNull();
    });

    it('should throw on missing name', () => {
      expect(() => validateTeamCreate({})).toThrow(ValidationError);
    });

    it('should throw on invalid description type', () => {
      expect(() => validateTeamCreate({ name: 'Team', description: 123 }))
        .toThrow(ValidationError);
    });
  });

  describe('validateTeamUpdate', () => {
    it('should return null for empty input', () => {
      const result = validateTeamUpdate({});
      expect(result).toBeNull();
    });

    it('should validate name update', () => {
      const result = validateTeamUpdate({ name: 'New Name' });
      expect(result?.name).toBe('New Name');
    });

    it('should throw on empty name', () => {
      expect(() => validateTeamUpdate({ name: '' })).toThrow(ValidationError);
    });

    it('should validate description update', () => {
      const result = validateTeamUpdate({ description: 'New desc' });
      expect(result?.description).toBe('New desc');
    });

    it('should allow null description', () => {
      const result = validateTeamUpdate({ description: null });
      expect(result?.description).toBeNull();
    });

    it('should throw on invalid description type', () => {
      expect(() => validateTeamUpdate({ description: 123 }))
        .toThrow(ValidationError);
    });
  });
});

describe('Team Member Validation', () => {
  describe('validateTeamMemberAdd', () => {
    it('should validate correct input', () => {
      const result = validateTeamMemberAdd({ user_id: 'user-123' });
      expect(result.user_id).toBe('user-123');
      expect(result.role).toBe('member');
    });

    it('should accept role', () => {
      const result = validateTeamMemberAdd({ user_id: 'user-123', role: 'lead' });
      expect(result.role).toBe('lead');
    });

    it('should throw on missing user_id', () => {
      expect(() => validateTeamMemberAdd({})).toThrow(ValidationError);
    });

    it('should throw on invalid user_id type', () => {
      expect(() => validateTeamMemberAdd({ user_id: 123 })).toThrow(ValidationError);
    });

    it('should throw on invalid role', () => {
      expect(() => validateTeamMemberAdd({ user_id: 'user-123', role: 'admin' }))
        .toThrow(ValidationError);
    });
  });

  describe('validateTeamMemberRoleUpdate', () => {
    it('should validate correct role', () => {
      expect(validateTeamMemberRoleUpdate({ role: 'lead' })).toBe('lead');
      expect(validateTeamMemberRoleUpdate({ role: 'member' })).toBe('member');
    });

    it('should throw on invalid role', () => {
      expect(() => validateTeamMemberRoleUpdate({ role: 'admin' }))
        .toThrow(ValidationError);
    });

    it('should throw on missing role', () => {
      expect(() => validateTeamMemberRoleUpdate({})).toThrow(ValidationError);
    });
  });
});

describe('Dependency Validation', () => {
  describe('validateDependencyType', () => {
    it('should validate correct types', () => {
      for (const type of DEPENDENCY_TYPES) {
        expect(validateDependencyType(type)).toBe(type);
      }
    });

    it('should throw on invalid type', () => {
      expect(() => validateDependencyType('invalid')).toThrow(ValidationError);
    });

    it('should throw on missing type', () => {
      expect(() => validateDependencyType(undefined)).toThrow(ValidationError);
      expect(() => validateDependencyType(null)).toThrow(ValidationError);
    });
  });
});

describe('Constants', () => {
  it('should export poll interval constants', () => {
    expect(MIN_POLL_INTERVAL_MS).toBe(5000);
    expect(MAX_POLL_INTERVAL_MS).toBe(3600000);
  });

  it('should export valid association types', () => {
    expect(VALID_ASSOCIATION_TYPES).toContain('api_call');
    expect(VALID_ASSOCIATION_TYPES).toContain('database');
  });

  it('should export valid team member roles', () => {
    expect(VALID_TEAM_MEMBER_ROLES).toContain('lead');
    expect(VALID_TEAM_MEMBER_ROLES).toContain('member');
  });
});

describe('Schema Config Validation', () => {
  describe('validateSchemaConfig', () => {
    const validConfig = {
      root: 'data.healthChecks',
      fields: {
        name: 'checkName',
        healthy: { field: 'status', equals: 'ok' },
      },
    };

    it('should accept a valid schema config object with required fields', () => {
      const result = validateSchemaConfig(validConfig);
      const parsed = JSON.parse(result);
      expect(parsed.root).toBe('data.healthChecks');
      expect(parsed.fields.name).toBe('checkName');
      expect(parsed.fields.healthy).toEqual({ field: 'status', equals: 'ok' });
    });

    it('should accept a valid JSON string', () => {
      const result = validateSchemaConfig(JSON.stringify(validConfig));
      const parsed = JSON.parse(result);
      expect(parsed.root).toBe('data.healthChecks');
    });

    it('should accept optional fields (latency, impact, description)', () => {
      const config = {
        root: 'checks',
        fields: {
          name: 'checkName',
          healthy: 'isHealthy',
          latency: 'responseTimeMs',
          impact: 'severity',
          description: 'displayName',
        },
      };
      const result = validateSchemaConfig(config);
      const parsed = JSON.parse(result);
      expect(parsed.fields.latency).toBe('responseTimeMs');
      expect(parsed.fields.impact).toBe('severity');
      expect(parsed.fields.description).toBe('displayName');
    });

    it('should accept nested dot-path field mappings', () => {
      const config = {
        root: 'data.health.checks',
        fields: {
          name: 'meta.name',
          healthy: { field: 'metrics.status', equals: 'UP' },
          latency: 'metrics.responseTime',
        },
      };
      const result = validateSchemaConfig(config);
      const parsed = JSON.parse(result);
      expect(parsed.fields.name).toBe('meta.name');
      expect(parsed.fields.healthy.field).toBe('metrics.status');
    });

    it('should reject non-object/non-string input', () => {
      expect(() => validateSchemaConfig(123)).toThrow(ValidationError);
      expect(() => validateSchemaConfig(true)).toThrow(ValidationError);
    });

    it('should reject invalid JSON string', () => {
      expect(() => validateSchemaConfig('not-json')).toThrow(ValidationError);
      expect(() => validateSchemaConfig('{invalid}')).toThrow(ValidationError);
    });

    it('should reject arrays', () => {
      expect(() => validateSchemaConfig([1, 2, 3])).toThrow(ValidationError);
      expect(() => validateSchemaConfig('[]')).toThrow(ValidationError);
    });

    it('should reject missing root', () => {
      expect(() => validateSchemaConfig({ fields: { name: 'n', healthy: 'h' } }))
        .toThrow(/schema_config\.root/);
    });

    it('should reject empty root', () => {
      expect(() => validateSchemaConfig({ root: '', fields: { name: 'n', healthy: 'h' } }))
        .toThrow(/schema_config\.root/);
    });

    it('should reject missing fields object', () => {
      expect(() => validateSchemaConfig({ root: 'data' }))
        .toThrow(/schema_config\.fields/);
    });

    it('should reject fields as non-object', () => {
      expect(() => validateSchemaConfig({ root: 'data', fields: 'bad' }))
        .toThrow(/schema_config\.fields/);
    });

    it('should reject missing required field: name', () => {
      expect(() => validateSchemaConfig({ root: 'data', fields: { healthy: 'h' } }))
        .toThrow(/schema_config\.fields\.name is required/);
    });

    it('should reject missing required field: healthy', () => {
      expect(() => validateSchemaConfig({ root: 'data', fields: { name: 'n' } }))
        .toThrow(/schema_config\.fields\.healthy is required/);
    });

    it('should reject unknown fields', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: 'h', unknownField: 'x' },
      })).toThrow(/unknown field "unknownField"/);
    });

    it('should reject empty string field mapping', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: '', healthy: 'h' },
      })).toThrow(/schema_config\.fields\.name/);
    });

    it('should reject boolean comparison with missing field', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: { equals: 'ok' } },
      })).toThrow(/schema_config\.fields\.healthy\.field/);
    });

    it('should reject boolean comparison with missing equals', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: { field: 'status' } },
      })).toThrow(/schema_config\.fields\.healthy\.equals/);
    });

    it('should reject number as field mapping', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 123, healthy: 'h' },
      })).toThrow(/schema_config\.fields\.name/);
    });

    it('should accept $key as name field mapping', () => {
      const result = validateSchemaConfig({
        root: 'components',
        fields: { name: '$key', healthy: { field: 'status', equals: 'UP' } },
      });
      const parsed = JSON.parse(result);
      expect(parsed.fields.name).toBe('$key');
    });

    it('should reject $key for healthy field', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: '$key' },
      })).toThrow(/schema_config\.fields\.healthy cannot use "\$key"/);
    });

    it('should reject $key for latency field', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: 'h', latency: '$key' },
      })).toThrow(/schema_config\.fields\.latency cannot use "\$key"/);
    });

    it('should reject $key for impact field', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: 'h', impact: '$key' },
      })).toThrow(/schema_config\.fields\.impact cannot use "\$key"/);
    });

    it('should reject $key for description field', () => {
      expect(() => validateSchemaConfig({
        root: 'data',
        fields: { name: 'n', healthy: 'h', description: '$key' },
      })).toThrow(/schema_config\.fields\.description cannot use "\$key"/);
    });
  });

  describe('validateServiceCreate with schema_config', () => {
    const baseInput = {
      name: 'Test Service',
      team_id: 'team-1',
      health_endpoint: 'https://example.com/health',
    };

    it('should pass through schema_config when provided as object', () => {
      const input = {
        ...baseInput,
        schema_config: {
          root: 'checks',
          fields: { name: 'checkName', healthy: 'isUp' },
        },
      };
      const result = validateServiceCreate(input);
      expect(result.schema_config).toBeDefined();
      const parsed = JSON.parse(result.schema_config!);
      expect(parsed.root).toBe('checks');
    });

    it('should accept null schema_config', () => {
      const result = validateServiceCreate({ ...baseInput, schema_config: null });
      expect(result.schema_config).toBeNull();
    });

    it('should omit schema_config when not provided', () => {
      const result = validateServiceCreate(baseInput);
      expect(result.schema_config).toBeUndefined();
    });

    it('should reject invalid schema_config', () => {
      expect(() => validateServiceCreate({
        ...baseInput,
        schema_config: { root: 'data' },
      })).toThrow(ValidationError);
    });
  });

  describe('validateServiceUpdate with schema_config', () => {
    it('should accept schema_config update', () => {
      const result = validateServiceUpdate({
        schema_config: {
          root: 'health',
          fields: { name: 'n', healthy: 'h' },
        },
      });
      expect(result).not.toBeNull();
      expect(result!.schema_config).toBeDefined();
      const parsed = JSON.parse(result!.schema_config!);
      expect(parsed.root).toBe('health');
    });

    it('should accept null schema_config (remove mapping)', () => {
      const result = validateServiceUpdate({ schema_config: null });
      expect(result).not.toBeNull();
      expect(result!.schema_config).toBeNull();
    });

    it('should reject invalid schema_config in update', () => {
      expect(() => validateServiceUpdate({
        schema_config: 'not-json',
      })).toThrow(ValidationError);
    });
  });
});
