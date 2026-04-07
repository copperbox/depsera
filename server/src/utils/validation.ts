import { ValidationError } from './errors';
import { AssociationType, DependencyType, TeamMemberRole, SchemaMapping, FieldMapping, HealthEndpointFormat, MetricSchemaConfig, VALID_METRIC_TARGETS, VALID_LABEL_TARGETS } from '../db/types';
import { validateUrlHostname } from './ssrf';

const VALID_HEALTH_ENDPOINT_FORMATS: HealthEndpointFormat[] = ['default', 'schema', 'prometheus', 'otlp'];

// ============================================================================
// URL Validation (moved from routes/services/validation.ts)
// ============================================================================

/**
 * Check if a string is a valid HTTP or HTTPS URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate a health/metrics endpoint URL.
 * Checks protocol AND blocks private/reserved IPs and localhost.
 * @throws ValidationError if URL targets a private/internal address
 */
export function validateEndpointUrl(urlString: string, field: string): void {
  if (!isValidUrl(urlString)) {
    throw new ValidationError(
      `${field} must be a valid HTTP or HTTPS URL`,
      field
    );
  }

  try {
    validateUrlHostname(urlString);
  } catch (error) {
    throw new ValidationError(
      `${field} must not target private or internal addresses`,
      field
    );
  }
}

// ============================================================================
// Polling Interval Constants
// ============================================================================

export const MIN_POLLING_INTERVAL = 10;
export const DEFAULT_POLLING_INTERVAL = 30;

export const MIN_POLL_INTERVAL_MS = 5000;
export const MAX_POLL_INTERVAL_MS = 3600000;
export const DEFAULT_POLL_INTERVAL_MS = 30000;

// ============================================================================
// Association Types
// ============================================================================

export const VALID_ASSOCIATION_TYPES: AssociationType[] = [
  'api_call',
  'database',
  'message_queue',
  'cache',
  'other',
];

// ============================================================================
// Team Member Roles
// ============================================================================

export const VALID_TEAM_MEMBER_ROLES: TeamMemberRole[] = ['lead', 'member'];

// ============================================================================
// Key Validation
// ============================================================================

/** Regex for team keys and manifest keys: lowercase alphanumeric, hyphens, underscores. */
export const TEAM_KEY_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
export const MAX_KEY_LENGTH = 128;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Check if a value is a string (can be empty)
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

// ============================================================================
// Service Validation
// ============================================================================

export interface ValidatedServiceInput {
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint: string | null;
  schema_config?: string | null;
  poll_interval_ms?: number;
  health_endpoint_format?: HealthEndpointFormat;
}

export interface ValidatedServiceUpdateInput {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string | null;
  schema_config?: string | null;
  poll_interval_ms?: number;
  is_active?: boolean;
  health_endpoint_format?: HealthEndpointFormat;
}

/**
 * Validate service creation input
 * @throws ValidationError if validation fails
 */
export function validateServiceCreate(input: Record<string, unknown>): ValidatedServiceInput {
  // Required: name
  if (!isNonEmptyString(input.name)) {
    throw new ValidationError('name is required and must be a non-empty string', 'name');
  }

  // Required: team_id
  if (!isString(input.team_id) || !input.team_id) {
    throw new ValidationError('team_id is required', 'team_id');
  }

  // Optional: health_endpoint_format (defaults to 'default')
  let healthEndpointFormat: HealthEndpointFormat | undefined;
  if (input.health_endpoint_format !== undefined) {
    if (!isString(input.health_endpoint_format) ||
        !VALID_HEALTH_ENDPOINT_FORMATS.includes(input.health_endpoint_format as HealthEndpointFormat)) {
      throw new ValidationError(
        `health_endpoint_format must be one of: ${VALID_HEALTH_ENDPOINT_FORMATS.join(', ')}`,
        'health_endpoint_format'
      );
    }
    healthEndpointFormat = input.health_endpoint_format as HealthEndpointFormat;
  }

  const isOtlp = healthEndpointFormat === 'otlp';

  // health_endpoint: required for polled formats, empty for OTLP
  if (isOtlp) {
    // OTLP is push-only — health_endpoint not used
    if (input.health_endpoint && isNonEmptyString(input.health_endpoint)) {
      throw new ValidationError('health_endpoint must be empty for OTLP format (push-only)', 'health_endpoint');
    }
  } else {
    if (!isString(input.health_endpoint) || !input.health_endpoint) {
      throw new ValidationError('health_endpoint is required', 'health_endpoint');
    }
    validateEndpointUrl(input.health_endpoint, 'health_endpoint');
  }

  // Optional: metrics_endpoint
  let metricsEndpoint: string | null = null;
  if (input.metrics_endpoint !== undefined && input.metrics_endpoint !== null) {
    if (!isString(input.metrics_endpoint)) {
      throw new ValidationError('metrics_endpoint must be a string', 'metrics_endpoint');
    }
    if (input.metrics_endpoint) {
      validateEndpointUrl(input.metrics_endpoint, 'metrics_endpoint');
    }
    metricsEndpoint = input.metrics_endpoint || null;
  }

  // Optional: poll_interval_ms (not applicable for OTLP)
  let pollIntervalMs: number | undefined;
  if (isOtlp) {
    pollIntervalMs = 0;
  } else if (input.poll_interval_ms !== undefined) {
    if (!isNumber(input.poll_interval_ms) || !Number.isInteger(input.poll_interval_ms)) {
      throw new ValidationError('poll_interval_ms must be an integer', 'poll_interval_ms');
    }
    if (input.poll_interval_ms < MIN_POLL_INTERVAL_MS || input.poll_interval_ms > MAX_POLL_INTERVAL_MS) {
      throw new ValidationError(
        `poll_interval_ms must be between ${MIN_POLL_INTERVAL_MS} and ${MAX_POLL_INTERVAL_MS}`,
        'poll_interval_ms'
      );
    }
    pollIntervalMs = input.poll_interval_ms;
  }

  // Optional: schema_config (format-aware)
  let schemaConfig: string | null | undefined;
  if (input.schema_config !== undefined) {
    if (input.schema_config === null) {
      schemaConfig = null;
    } else if (healthEndpointFormat === 'prometheus' || healthEndpointFormat === 'otlp') {
      schemaConfig = validateMetricSchemaConfig(input.schema_config);
    } else if (healthEndpointFormat === 'default') {
      schemaConfig = null;
    } else {
      // 'schema' or undefined — use original schema validator
      schemaConfig = validateSchemaConfig(input.schema_config);
    }
  } else if (healthEndpointFormat === 'default') {
    schemaConfig = null;
  }

  return {
    name: input.name.trim(),
    team_id: input.team_id,
    health_endpoint: isOtlp ? '' : (input.health_endpoint as string),
    metrics_endpoint: metricsEndpoint,
    schema_config: schemaConfig,
    poll_interval_ms: pollIntervalMs,
    health_endpoint_format: healthEndpointFormat,
  };
}

/**
 * Validate service update input
 * @throws ValidationError if validation fails
 * @returns null if no valid fields to update
 */
export function validateServiceUpdate(
  input: Record<string, unknown>
): ValidatedServiceUpdateInput | null {
  const result: ValidatedServiceUpdateInput = {};
  let hasUpdates = false;

  // Optional: name
  if (input.name !== undefined) {
    if (!isNonEmptyString(input.name)) {
      throw new ValidationError('name must be a non-empty string', 'name');
    }
    result.name = input.name.trim();
    hasUpdates = true;
  }

  // Optional: team_id
  if (input.team_id !== undefined) {
    if (!isString(input.team_id)) {
      throw new ValidationError('team_id must be a string', 'team_id');
    }
    result.team_id = input.team_id;
    hasUpdates = true;
  }

  // Optional: health_endpoint
  if (input.health_endpoint !== undefined) {
    validateEndpointUrl(input.health_endpoint as string, 'health_endpoint');
    result.health_endpoint = input.health_endpoint as string;
    hasUpdates = true;
  }

  // Optional: metrics_endpoint
  if (input.metrics_endpoint !== undefined) {
    if (input.metrics_endpoint !== null) {
      validateEndpointUrl(input.metrics_endpoint as string, 'metrics_endpoint');
    }
    result.metrics_endpoint = input.metrics_endpoint as string | null;
    hasUpdates = true;
  }

  // Optional: poll_interval_ms
  if (input.poll_interval_ms !== undefined) {
    if (!isNumber(input.poll_interval_ms) || !Number.isInteger(input.poll_interval_ms)) {
      throw new ValidationError('poll_interval_ms must be an integer', 'poll_interval_ms');
    }
    if (input.poll_interval_ms < MIN_POLL_INTERVAL_MS || input.poll_interval_ms > MAX_POLL_INTERVAL_MS) {
      throw new ValidationError(
        `poll_interval_ms must be between ${MIN_POLL_INTERVAL_MS} and ${MAX_POLL_INTERVAL_MS}`,
        'poll_interval_ms'
      );
    }
    result.poll_interval_ms = input.poll_interval_ms;
    hasUpdates = true;
  }

  // Optional: schema_config (format-aware)
  if (input.schema_config !== undefined) {
    if (input.schema_config === null) {
      result.schema_config = null;
    } else {
      const updateFormat = input.health_endpoint_format as HealthEndpointFormat | undefined;
      if (updateFormat === 'prometheus' || updateFormat === 'otlp') {
        result.schema_config = validateMetricSchemaConfig(input.schema_config);
      } else if (updateFormat === 'default') {
        result.schema_config = null;
      } else if (updateFormat === 'schema' || updateFormat === undefined) {
        // Format not in payload — detect config shape
        if (updateFormat === undefined) {
          let parsed: Record<string, unknown>;
          if (isString(input.schema_config)) {
            try {
              parsed = JSON.parse(input.schema_config) as Record<string, unknown>;
            } catch {
              // Let the validators produce the proper error
              parsed = {};
            }
          } else if (typeof input.schema_config === 'object' && input.schema_config !== null) {
            parsed = input.schema_config as Record<string, unknown>;
          } else {
            parsed = {};
          }
          if ('metrics' in parsed || 'labels' in parsed) {
            result.schema_config = validateMetricSchemaConfig(input.schema_config);
          } else {
            result.schema_config = validateSchemaConfig(input.schema_config);
          }
        } else {
          // updateFormat === 'schema'
          result.schema_config = validateSchemaConfig(input.schema_config);
        }
      }
    }
    hasUpdates = true;
  }

  // Optional: is_active
  if (input.is_active !== undefined) {
    if (!isBoolean(input.is_active)) {
      throw new ValidationError('is_active must be a boolean', 'is_active');
    }
    result.is_active = input.is_active;
    hasUpdates = true;
  }

  // Optional: health_endpoint_format
  if (input.health_endpoint_format !== undefined) {
    if (!isString(input.health_endpoint_format) ||
        !VALID_HEALTH_ENDPOINT_FORMATS.includes(input.health_endpoint_format as HealthEndpointFormat)) {
      throw new ValidationError(
        `health_endpoint_format must be one of: ${VALID_HEALTH_ENDPOINT_FORMATS.join(', ')}`,
        'health_endpoint_format'
      );
    }
    result.health_endpoint_format = input.health_endpoint_format as HealthEndpointFormat;
    hasUpdates = true;
  }

  return hasUpdates ? result : null;
}

// ============================================================================
// External Service Validation
// ============================================================================

export interface ValidatedExternalServiceInput {
  name: string;
  team_id: string;
  description: string | null;
}

export interface ValidatedExternalServiceUpdateInput {
  name?: string;
  description?: string | null;
}

/**
 * Validate external service creation input
 * @throws ValidationError if validation fails
 */
export function validateExternalServiceCreate(
  input: Record<string, unknown>
): ValidatedExternalServiceInput {
  // Required: name
  if (!isNonEmptyString(input.name)) {
    throw new ValidationError('name is required and must be a non-empty string', 'name');
  }

  // Required: team_id
  if (!isString(input.team_id) || !input.team_id) {
    throw new ValidationError('team_id is required', 'team_id');
  }

  // Optional: description
  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (!isString(input.description)) {
      throw new ValidationError('description must be a string', 'description');
    }
    description = input.description || null;
  }

  return {
    name: input.name.trim(),
    team_id: input.team_id,
    description,
  };
}

/**
 * Validate external service update input
 * @throws ValidationError if validation fails
 * @returns null if no valid fields to update
 */
export function validateExternalServiceUpdate(
  input: Record<string, unknown>
): ValidatedExternalServiceUpdateInput | null {
  const result: ValidatedExternalServiceUpdateInput = {};
  let hasUpdates = false;

  // Optional: name
  if (input.name !== undefined) {
    if (!isNonEmptyString(input.name)) {
      throw new ValidationError('name must be a non-empty string', 'name');
    }
    result.name = input.name.trim();
    hasUpdates = true;
  }

  // Optional: description
  if (input.description !== undefined) {
    if (input.description !== null && !isString(input.description)) {
      throw new ValidationError('description must be a string', 'description');
    }
    result.description = input.description as string | null;
    hasUpdates = true;
  }

  return hasUpdates ? result : null;
}

// ============================================================================
// Association Validation
// ============================================================================

export interface ValidatedAssociationInput {
  linked_service_id: string;
  association_type: AssociationType;
}

/**
 * Validate association creation input
 * @throws ValidationError if validation fails
 */
export function validateAssociationCreate(
  input: Record<string, unknown>
): ValidatedAssociationInput {
  // Required: linked_service_id
  if (!isString(input.linked_service_id) || !input.linked_service_id) {
    throw new ValidationError('linked_service_id is required', 'linked_service_id');
  }

  // Required: association_type
  if (
    !input.association_type ||
    !VALID_ASSOCIATION_TYPES.includes(input.association_type as AssociationType)
  ) {
    throw new ValidationError(
      `association_type must be one of: ${VALID_ASSOCIATION_TYPES.join(', ')}`,
      'association_type'
    );
  }

  return {
    linked_service_id: input.linked_service_id,
    association_type: input.association_type as AssociationType,
  };
}

// ============================================================================
// Team Validation
// ============================================================================

export interface ValidatedTeamInput {
  name: string;
  key: string;
  description: string | null;
  contact: string | null;
}

export interface ValidatedTeamUpdateInput {
  name?: string;
  key?: string;
  description?: string | null;
}

/**
 * Validate team creation input
 * @throws ValidationError if validation fails
 */
export function validateTeamCreate(input: Record<string, unknown>): ValidatedTeamInput {
  // Required: name
  if (!isNonEmptyString(input.name)) {
    throw new ValidationError('name is required and must be a non-empty string', 'name');
  }

  // Required: key
  if (!isNonEmptyString(input.key)) {
    throw new ValidationError('key is required and must be a non-empty string', 'key');
  }
  if (input.key.length > MAX_KEY_LENGTH) {
    throw new ValidationError(`key must be at most ${MAX_KEY_LENGTH} characters`, 'key');
  }
  if (!TEAM_KEY_REGEX.test(input.key)) {
    throw new ValidationError(
      'key must match pattern ^[a-z0-9][a-z0-9_-]*$ (lowercase alphanumeric, hyphens, underscores)',
      'key',
    );
  }

  // Optional: description
  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (!isString(input.description)) {
      throw new ValidationError('description must be a string', 'description');
    }
    description = input.description || null;
  }

  // Optional: contact (JSON object string)
  let contact: string | null = null;
  if (input.contact !== undefined && input.contact !== null) {
    if (!isString(input.contact)) {
      throw new ValidationError('contact must be a JSON string or null', 'contact');
    }
    try {
      const parsed = JSON.parse(input.contact);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ValidationError('contact must be a valid JSON object string', 'contact');
      }
      contact = input.contact;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('contact must be a valid JSON object string', 'contact');
    }
  }

  return {
    name: input.name.trim(),
    key: input.key,
    description,
    contact,
  };
}

/**
 * Validate team update input
 * @throws ValidationError if validation fails
 * @returns null if no valid fields to update
 */
export function validateTeamUpdate(
  input: Record<string, unknown>
): ValidatedTeamUpdateInput | null {
  const result: ValidatedTeamUpdateInput = {};
  let hasUpdates = false;

  // Optional: name
  if (input.name !== undefined) {
    if (!isNonEmptyString(input.name)) {
      throw new ValidationError('name must be a non-empty string', 'name');
    }
    result.name = input.name.trim();
    hasUpdates = true;
  }

  // Optional: key
  if (input.key !== undefined) {
    if (!isNonEmptyString(input.key)) {
      throw new ValidationError('key must be a non-empty string', 'key');
    }
    if (input.key.length > MAX_KEY_LENGTH) {
      throw new ValidationError(`key must be at most ${MAX_KEY_LENGTH} characters`, 'key');
    }
    if (!TEAM_KEY_REGEX.test(input.key)) {
      throw new ValidationError(
        'key must match pattern ^[a-z0-9][a-z0-9_-]*$ (lowercase alphanumeric, hyphens, underscores)',
        'key',
      );
    }
    result.key = input.key;
    hasUpdates = true;
  }

  // Optional: description
  if (input.description !== undefined) {
    if (input.description !== null && !isString(input.description)) {
      throw new ValidationError('description must be a string', 'description');
    }
    result.description = input.description as string | null;
    hasUpdates = true;
  }

  return hasUpdates ? result : null;
}

// ============================================================================
// Team Member Validation
// ============================================================================

export interface ValidatedTeamMemberInput {
  user_id: string;
  role: TeamMemberRole;
}

/**
 * Validate team member add input
 * @throws ValidationError if validation fails
 */
export function validateTeamMemberAdd(input: Record<string, unknown>): ValidatedTeamMemberInput {
  // Required: user_id
  if (!isString(input.user_id) || !input.user_id) {
    throw new ValidationError('user_id is required', 'user_id');
  }

  // Required: role (defaults to 'member')
  const role = input.role || 'member';
  if (!VALID_TEAM_MEMBER_ROLES.includes(role as TeamMemberRole)) {
    throw new ValidationError(
      `role must be one of: ${VALID_TEAM_MEMBER_ROLES.join(', ')}`,
      'role'
    );
  }

  return {
    user_id: input.user_id,
    role: role as TeamMemberRole,
  };
}

/**
 * Validate team member role update input
 * @throws ValidationError if validation fails
 */
export function validateTeamMemberRoleUpdate(input: Record<string, unknown>): TeamMemberRole {
  if (!input.role || !VALID_TEAM_MEMBER_ROLES.includes(input.role as TeamMemberRole)) {
    throw new ValidationError(
      `role must be one of: ${VALID_TEAM_MEMBER_ROLES.join(', ')}`,
      'role'
    );
  }

  return input.role as TeamMemberRole;
}

// ============================================================================
// Dependency Validation
// ============================================================================

/**
 * Validate dependency type
 * @throws ValidationError if validation fails
 */
export function validateDependencyType(type: unknown): DependencyType {
  if (typeof type !== 'string' || type.trim() === '') {
    throw new ValidationError(
      'type must be a non-empty string',
      'type'
    );
  }
  return type as DependencyType;
}

// ============================================================================
// Metric Schema Config Validation (Prometheus / OTLP)
// ============================================================================

/**
 * Validate and serialize a MetricSchemaConfig value for Prometheus/OTLP formats.
 * Accepts either a JSON string or an object. Returns a validated JSON string.
 * @throws ValidationError if the config is invalid
 */
export function validateMetricSchemaConfig(value: unknown): string {
  let parsed: unknown;

  if (isString(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError('schema_config must be valid JSON', 'schema_config');
    }
  } else if (typeof value === 'object' && value !== null) {
    parsed = value;
  } else {
    throw new ValidationError(
      'schema_config must be a JSON string or object',
      'schema_config'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('schema_config must be a JSON object', 'schema_config');
  }

  const config = parsed as Record<string, unknown>;

  // Validate metrics (required object)
  if (!('metrics' in config)) {
    throw new ValidationError('schema_config.metrics is required', 'schema_config');
  }
  if (typeof config.metrics !== 'object' || config.metrics === null || Array.isArray(config.metrics)) {
    throw new ValidationError('schema_config.metrics must be an object', 'schema_config');
  }

  const metrics = config.metrics as Record<string, unknown>;
  const seenMetricTargets = new Set<string>();
  for (const [key, target] of Object.entries(metrics)) {
    if (!isString(target)) {
      throw new ValidationError(
        `schema_config.metrics.${key} must be a string`,
        'schema_config'
      );
    }
    if (!VALID_METRIC_TARGETS.includes(target as typeof VALID_METRIC_TARGETS[number])) {
      throw new ValidationError(
        `schema_config.metrics.${key} has invalid target "${target}". Valid targets: ${VALID_METRIC_TARGETS.join(', ')}`,
        'schema_config'
      );
    }
    if (seenMetricTargets.has(target)) {
      throw new ValidationError(
        `schema_config.metrics has duplicate target "${target}"`,
        'schema_config'
      );
    }
    seenMetricTargets.add(target);
  }

  // Validate labels (required object)
  if (!('labels' in config)) {
    throw new ValidationError('schema_config.labels is required', 'schema_config');
  }
  if (typeof config.labels !== 'object' || config.labels === null || Array.isArray(config.labels)) {
    throw new ValidationError('schema_config.labels must be an object', 'schema_config');
  }

  const labels = config.labels as Record<string, unknown>;
  const seenLabelTargets = new Set<string>();
  for (const [key, target] of Object.entries(labels)) {
    if (!isString(target)) {
      throw new ValidationError(
        `schema_config.labels.${key} must be a string`,
        'schema_config'
      );
    }
    if (!VALID_LABEL_TARGETS.includes(target as typeof VALID_LABEL_TARGETS[number])) {
      throw new ValidationError(
        `schema_config.labels.${key} has invalid target "${target}". Valid targets: ${VALID_LABEL_TARGETS.join(', ')}`,
        'schema_config'
      );
    }
    if (seenLabelTargets.has(target)) {
      throw new ValidationError(
        `schema_config.labels has duplicate target "${target}"`,
        'schema_config'
      );
    }
    seenLabelTargets.add(target);
  }

  // Validate latency_unit (optional)
  if (config.latency_unit !== undefined) {
    if (config.latency_unit !== 'ms' && config.latency_unit !== 's') {
      throw new ValidationError(
        'schema_config.latency_unit must be "ms" or "s"',
        'schema_config'
      );
    }
  }

  // Validate healthy_value (optional)
  if (config.healthy_value !== undefined) {
    if (!isNumber(config.healthy_value)) {
      throw new ValidationError(
        'schema_config.healthy_value must be a number',
        'schema_config'
      );
    }
  }

  // Build validated object
  const validated: MetricSchemaConfig = {
    metrics: metrics as Record<string, string>,
    labels: labels as Record<string, string>,
    ...(config.latency_unit !== undefined && { latency_unit: config.latency_unit as 'ms' | 's' }),
    ...(config.healthy_value !== undefined && { healthy_value: config.healthy_value as number }),
  };

  return JSON.stringify(validated);
}

// ============================================================================
// Schema Config Validation
// ============================================================================

const VALID_SCHEMA_FIELDS = ['name', 'healthy', 'latency', 'impact', 'description', 'type', 'checkDetails', 'contact', 'error', 'errorMessage', 'skipped'] as const;
const REQUIRED_SCHEMA_FIELDS: (keyof SchemaMapping['fields'])[] = ['name', 'healthy'];

/**
 * Validate a single field mapping value.
 * Must be a non-empty string (direct mapping or dot-path) or a BooleanComparison object.
 * @throws ValidationError if invalid
 */
function validateFieldMapping(value: unknown, fieldName: string): FieldMapping {
  if (isNonEmptyString(value)) {
    return value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (!isNonEmptyString(obj.field)) {
      throw new ValidationError(
        `schema_config.fields.${fieldName}.field must be a non-empty string`,
        'schema_config'
      );
    }
    if (!isNonEmptyString(obj.equals)) {
      throw new ValidationError(
        `schema_config.fields.${fieldName}.equals must be a non-empty string`,
        'schema_config'
      );
    }
    return { field: obj.field, equals: obj.equals };
  }

  throw new ValidationError(
    `schema_config.fields.${fieldName} must be a string or { field, equals } object`,
    'schema_config'
  );
}

/**
 * Validate and serialize a schema_config value.
 * Accepts either a JSON string or an object. Returns a validated JSON string.
 * @throws ValidationError if the schema config is invalid
 */
export function validateSchemaConfig(value: unknown): string {
  let parsed: unknown;

  if (isString(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError('schema_config must be valid JSON', 'schema_config');
    }
  } else if (typeof value === 'object' && value !== null) {
    parsed = value;
  } else {
    throw new ValidationError(
      'schema_config must be a JSON string or object',
      'schema_config'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('schema_config must be a JSON object', 'schema_config');
  }

  const config = parsed as Record<string, unknown>;

  // Validate root
  if (!isNonEmptyString(config.root)) {
    throw new ValidationError('schema_config.root must be a non-empty string', 'schema_config');
  }

  // Validate fields
  if (typeof config.fields !== 'object' || config.fields === null || Array.isArray(config.fields)) {
    throw new ValidationError('schema_config.fields must be an object', 'schema_config');
  }

  const fields = config.fields as Record<string, unknown>;

  // Check required fields
  for (const requiredField of REQUIRED_SCHEMA_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection
    if (fields[requiredField] === undefined) {
      throw new ValidationError(
        `schema_config.fields.${requiredField} is required`,
        'schema_config'
      );
    }
  }

  // Validate all field mappings
  const validatedFields: Record<string, FieldMapping> = {};
  const validatedStringPaths: Record<string, string> = {};
  // Fields that use simple string paths (not FieldMapping / BooleanComparison)
  const STRING_PATH_FIELDS = ['checkDetails', 'contact', 'error', 'errorMessage'] as const;
  for (const key of Object.keys(fields)) {
    if (!VALID_SCHEMA_FIELDS.includes(key as typeof VALID_SCHEMA_FIELDS[number])) {
      throw new ValidationError(
        `schema_config.fields contains unknown field "${key}". Valid fields: ${VALID_SCHEMA_FIELDS.join(', ')}`,
        'schema_config'
      );
    }
    if (STRING_PATH_FIELDS.includes(key as typeof STRING_PATH_FIELDS[number])) {
      // Simple string path fields (no BooleanComparison support)
      // eslint-disable-next-line security/detect-object-injection
      if (!isNonEmptyString(fields[key])) {
        throw new ValidationError(
          `schema_config.fields.${key} must be a non-empty string path`,
          'schema_config'
        );
      }
      // eslint-disable-next-line security/detect-object-injection
      if (fields[key] === '$key') {
        throw new ValidationError(
          `schema_config.fields.${key} cannot use "$key" — it is only valid for the name field`,
          'schema_config'
        );
      }
      // eslint-disable-next-line security/detect-object-injection
      validatedStringPaths[key] = fields[key] as string;
    } else {
      // eslint-disable-next-line security/detect-object-injection
      validatedFields[key] = validateFieldMapping(fields[key], key);
    }
  }

  // Restrict $key sentinel to name field only
  const KEY_SENTINEL = '$key';
  for (const [fieldName, mapping] of Object.entries(validatedFields)) {
    if (fieldName !== 'name' && typeof mapping === 'string' && mapping === KEY_SENTINEL) {
      throw new ValidationError(
        `schema_config.fields.${fieldName} cannot use "$key" — it is only valid for the name field`,
        'schema_config'
      );
    }
  }

  // Build validated SchemaMapping
  const validated: SchemaMapping = {
    root: config.root,
    fields: {
      name: validatedFields.name,
      healthy: validatedFields.healthy,
      ...(validatedFields.latency !== undefined && { latency: validatedFields.latency }),
      ...(validatedFields.impact !== undefined && { impact: validatedFields.impact }),
      ...(validatedFields.description !== undefined && { description: validatedFields.description }),
      ...(validatedFields.type !== undefined && { type: validatedFields.type }),
      ...(validatedStringPaths.checkDetails !== undefined && { checkDetails: validatedStringPaths.checkDetails }),
      ...(validatedStringPaths.contact !== undefined && { contact: validatedStringPaths.contact }),
      ...(validatedStringPaths.error !== undefined && { error: validatedStringPaths.error }),
      ...(validatedStringPaths.errorMessage !== undefined && { errorMessage: validatedStringPaths.errorMessage }),
      ...(validatedFields.skipped !== undefined && { skipped: validatedFields.skipped }),
    },
  };

  return JSON.stringify(validated);
}
