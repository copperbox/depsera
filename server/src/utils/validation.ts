import { ValidationError } from './errors';
import { AssociationType, DependencyType, DEPENDENCY_TYPES, TeamMemberRole } from '../db/types';

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

// ============================================================================
// Polling Interval Constants
// ============================================================================

export const MIN_POLLING_INTERVAL = 10;
export const DEFAULT_POLLING_INTERVAL = 30;

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
  polling_interval: number;
}

export interface ValidatedServiceUpdateInput {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string | null;
  polling_interval?: number;
  is_active?: boolean;
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

  // Required: health_endpoint
  if (!isString(input.health_endpoint) || !input.health_endpoint) {
    throw new ValidationError('health_endpoint is required', 'health_endpoint');
  }

  if (!isValidUrl(input.health_endpoint)) {
    throw new ValidationError(
      'health_endpoint must be a valid HTTP or HTTPS URL',
      'health_endpoint'
    );
  }

  // Optional: metrics_endpoint
  let metricsEndpoint: string | null = null;
  if (input.metrics_endpoint !== undefined && input.metrics_endpoint !== null) {
    if (!isString(input.metrics_endpoint)) {
      throw new ValidationError('metrics_endpoint must be a string', 'metrics_endpoint');
    }
    if (input.metrics_endpoint && !isValidUrl(input.metrics_endpoint)) {
      throw new ValidationError(
        'metrics_endpoint must be a valid HTTP or HTTPS URL',
        'metrics_endpoint'
      );
    }
    metricsEndpoint = input.metrics_endpoint || null;
  }

  // Optional: polling_interval
  let pollingInterval = DEFAULT_POLLING_INTERVAL;
  if (input.polling_interval !== undefined) {
    if (!isNumber(input.polling_interval) || input.polling_interval < MIN_POLLING_INTERVAL) {
      throw new ValidationError(
        `polling_interval must be a number >= ${MIN_POLLING_INTERVAL} seconds`,
        'polling_interval'
      );
    }
    pollingInterval = input.polling_interval;
  }

  return {
    name: input.name.trim(),
    team_id: input.team_id,
    health_endpoint: input.health_endpoint,
    metrics_endpoint: metricsEndpoint,
    polling_interval: pollingInterval,
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
    if (!isValidUrl(input.health_endpoint as string)) {
      throw new ValidationError(
        'health_endpoint must be a valid HTTP or HTTPS URL',
        'health_endpoint'
      );
    }
    result.health_endpoint = input.health_endpoint as string;
    hasUpdates = true;
  }

  // Optional: metrics_endpoint
  if (input.metrics_endpoint !== undefined) {
    if (input.metrics_endpoint !== null && !isValidUrl(input.metrics_endpoint as string)) {
      throw new ValidationError(
        'metrics_endpoint must be a valid HTTP or HTTPS URL',
        'metrics_endpoint'
      );
    }
    result.metrics_endpoint = input.metrics_endpoint as string | null;
    hasUpdates = true;
  }

  // Optional: polling_interval
  if (input.polling_interval !== undefined) {
    if (!isNumber(input.polling_interval) || input.polling_interval < MIN_POLLING_INTERVAL) {
      throw new ValidationError(
        `polling_interval must be a number >= ${MIN_POLLING_INTERVAL} seconds`,
        'polling_interval'
      );
    }
    result.polling_interval = input.polling_interval;
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
  description: string | null;
}

export interface ValidatedTeamUpdateInput {
  name?: string;
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
    description,
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
  if (!type || !DEPENDENCY_TYPES.includes(type as DependencyType)) {
    throw new ValidationError(
      `type must be one of: ${DEPENDENCY_TYPES.join(', ')}`,
      'type'
    );
  }
  return type as DependencyType;
}
