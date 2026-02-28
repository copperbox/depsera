import {
  ManifestValidationResult,
  ManifestValidationIssue,
} from './types';
import {
  isValidUrl,
  isNonEmptyString,
  isNumber,
  validateSchemaConfig,
  VALID_ASSOCIATION_TYPES,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
} from '../../utils/validation';
import { validateUrlHostname } from '../../utils/ssrf';

// --- Constants ---

const MANIFEST_KEY_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_KEY_LENGTH = 128;

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version',
  'services',
  'aliases',
  'canonical_overrides',
  'associations',
]);

const KNOWN_SERVICE_FIELDS = new Set([
  'key',
  'name',
  'health_endpoint',
  'description',
  'metrics_endpoint',
  'poll_interval_ms',
  'schema_config',
]);

const KNOWN_ALIAS_FIELDS = new Set(['alias', 'canonical_name']);
const KNOWN_OVERRIDE_FIELDS = new Set(['canonical_name', 'contact', 'impact']);
const KNOWN_ASSOCIATION_FIELDS = new Set([
  'service_key',
  'dependency_name',
  'association_type',
]);

// --- Helpers ---

function addError(
  issues: ManifestValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ severity: 'error', path, message });
}

function addWarning(
  issues: ManifestValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ severity: 'warning', path, message });
}

function warnUnknownKeys(
  obj: Record<string, unknown>,
  known: Set<string>,
  basePath: string,
  warnings: ManifestValidationIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      addWarning(warnings, `${basePath}.${key}`, `Unknown field "${key}"`);
    }
  }
}

/**
 * Validate a URL field in a manifest entry.
 * Invalid URL → error. SSRF-blocked hostname → warning.
 */
function validateManifestUrl(
  value: unknown,
  path: string,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): boolean {
  if (typeof value !== 'string' || !value) {
    addError(errors, path, 'Must be a non-empty string');
    return false;
  }
  if (!isValidUrl(value)) {
    addError(errors, path, 'Must be a valid HTTP or HTTPS URL');
    return false;
  }
  try {
    validateUrlHostname(value);
  } catch {
    addWarning(warnings, path, 'URL targets a private or internal address');
  }
  return true;
}

// --- Level 1: Manifest Structure ---

function validateStructure(
  data: unknown,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): { valid: boolean; version: number | null; obj: Record<string, unknown> | null } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    addError(errors, '', 'Manifest must be a JSON object');
    return { valid: false, version: null, obj: null };
  }

  const obj = data as Record<string, unknown>;

  // Warn on unknown top-level keys
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      addWarning(warnings, key, `Unknown top-level key "${key}"`);
    }
  }

  // version: must be present and equal 1
  if (obj.version === undefined || obj.version === null) {
    addError(errors, 'version', 'version is required');
    return { valid: false, version: null, obj };
  }
  if (obj.version !== 1) {
    addError(errors, 'version', `Unsupported manifest version: ${String(obj.version)}. Only version 1 is supported`);
    return { valid: false, version: null, obj };
  }

  // services: must be present and be an array
  if (!Array.isArray(obj.services)) {
    addError(errors, 'services', 'services must be present and be an array');
    return { valid: false, version: 1, obj };
  }

  return { valid: true, version: 1, obj };
}

// --- Level 2: Per-Service Entry Validation ---

function validateServiceEntry(
  entry: unknown,
  index: number,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): boolean {
  const path = `services[${index}]`;

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    addError(errors, path, 'Service entry must be an object');
    return false;
  }

  const svc = entry as Record<string, unknown>;
  let entryValid = true;

  // Warn on unknown fields
  warnUnknownKeys(svc, KNOWN_SERVICE_FIELDS, path, warnings);

  // Required: key
  if (!isNonEmptyString(svc.key)) {
    addError(errors, `${path}.key`, 'key is required and must be a non-empty string');
    entryValid = false;
  } else {
    if (svc.key.length > MAX_KEY_LENGTH) {
      addError(errors, `${path}.key`, `key must be at most ${MAX_KEY_LENGTH} characters`);
      entryValid = false;
    } else if (!MANIFEST_KEY_REGEX.test(svc.key)) {
      addError(
        errors,
        `${path}.key`,
        'key must match pattern ^[a-z0-9][a-z0-9_-]*$ (lowercase alphanumeric, hyphens, underscores)',
      );
      entryValid = false;
    }
  }

  // Required: name
  if (!isNonEmptyString(svc.name)) {
    addError(errors, `${path}.name`, 'name is required and must be a non-empty string');
    entryValid = false;
  }

  // Required: health_endpoint (URL validation)
  if (!isNonEmptyString(svc.health_endpoint)) {
    addError(errors, `${path}.health_endpoint`, 'health_endpoint is required and must be a non-empty string');
    entryValid = false;
  } else {
    if (!validateManifestUrl(svc.health_endpoint, `${path}.health_endpoint`, errors, warnings)) {
      entryValid = false;
    }
  }

  // Optional: description
  if (svc.description !== undefined && svc.description !== null) {
    if (typeof svc.description !== 'string') {
      addError(errors, `${path}.description`, 'description must be a string');
      entryValid = false;
    }
  }

  // Optional: metrics_endpoint (URL validation)
  if (svc.metrics_endpoint !== undefined && svc.metrics_endpoint !== null) {
    if (typeof svc.metrics_endpoint !== 'string' || !svc.metrics_endpoint) {
      addError(errors, `${path}.metrics_endpoint`, 'metrics_endpoint must be a non-empty string');
      entryValid = false;
    } else {
      validateManifestUrl(svc.metrics_endpoint, `${path}.metrics_endpoint`, errors, warnings);
    }
  }

  // Optional: poll_interval_ms (bounds check)
  if (svc.poll_interval_ms !== undefined && svc.poll_interval_ms !== null) {
    if (!isNumber(svc.poll_interval_ms) || !Number.isInteger(svc.poll_interval_ms)) {
      addError(errors, `${path}.poll_interval_ms`, 'poll_interval_ms must be an integer');
      entryValid = false;
    } else if (svc.poll_interval_ms < MIN_POLL_INTERVAL_MS || svc.poll_interval_ms > MAX_POLL_INTERVAL_MS) {
      addError(
        errors,
        `${path}.poll_interval_ms`,
        `poll_interval_ms must be between ${MIN_POLL_INTERVAL_MS} and ${MAX_POLL_INTERVAL_MS}`,
      );
      entryValid = false;
    }
  }

  // Optional: schema_config (validate via validateSchemaConfig)
  if (svc.schema_config !== undefined && svc.schema_config !== null) {
    try {
      validateSchemaConfig(svc.schema_config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid schema_config';
      addError(errors, `${path}.schema_config`, message);
      entryValid = false;
    }
  }

  return entryValid;
}

// --- Level 2/3: Optional Section Validation ---

function validateAliases(
  aliases: unknown,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): void {
  if (aliases === undefined || aliases === null) return;

  if (!Array.isArray(aliases)) {
    addError(errors, 'aliases', 'aliases must be an array');
    return;
  }

  const seenAliases = new Set<string>();

  for (let i = 0; i < aliases.length; i++) {
    const entry = aliases[i];
    const path = `aliases[${i}]`;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      addError(errors, path, 'Alias entry must be an object');
      continue;
    }

    const alias = entry as Record<string, unknown>;

    // Warn on unknown fields
    warnUnknownKeys(alias, KNOWN_ALIAS_FIELDS, path, warnings);

    // Required: alias
    if (!isNonEmptyString(alias.alias)) {
      addError(errors, `${path}.alias`, 'alias is required and must be a non-empty string');
      continue;
    }

    // Required: canonical_name
    if (!isNonEmptyString(alias.canonical_name)) {
      addError(errors, `${path}.canonical_name`, 'canonical_name is required and must be a non-empty string');
      continue;
    }

    // Duplicate alias check
    if (seenAliases.has(alias.alias)) {
      addError(errors, `${path}.alias`, `Duplicate alias "${alias.alias}"`);
    } else {
      seenAliases.add(alias.alias);
    }
  }
}

function validateCanonicalOverrides(
  overrides: unknown,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): void {
  if (overrides === undefined || overrides === null) return;

  if (!Array.isArray(overrides)) {
    addError(errors, 'canonical_overrides', 'canonical_overrides must be an array');
    return;
  }

  const seenNames = new Set<string>();

  for (let i = 0; i < overrides.length; i++) {
    const entry = overrides[i];
    const path = `canonical_overrides[${i}]`;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      addError(errors, path, 'Canonical override entry must be an object');
      continue;
    }

    const override = entry as Record<string, unknown>;

    // Warn on unknown fields
    warnUnknownKeys(override, KNOWN_OVERRIDE_FIELDS, path, warnings);

    // Required: canonical_name
    if (!isNonEmptyString(override.canonical_name)) {
      addError(errors, `${path}.canonical_name`, 'canonical_name is required and must be a non-empty string');
      continue;
    }

    // At least one of contact or impact required
    const hasContact = override.contact !== undefined && override.contact !== null;
    const hasImpact = override.impact !== undefined && override.impact !== null;

    if (!hasContact && !hasImpact) {
      addError(errors, path, 'At least one of contact or impact is required');
      continue;
    }

    // Validate contact is an object if provided
    if (hasContact) {
      if (typeof override.contact !== 'object' || Array.isArray(override.contact)) {
        addError(errors, `${path}.contact`, 'contact must be an object');
      }
    }

    // Validate impact is a string if provided
    if (hasImpact) {
      if (typeof override.impact !== 'string') {
        addError(errors, `${path}.impact`, 'impact must be a string');
      }
    }

    // Duplicate canonical_name check
    if (seenNames.has(override.canonical_name)) {
      addError(errors, `${path}.canonical_name`, `Duplicate canonical_name "${override.canonical_name}"`);
    } else {
      seenNames.add(override.canonical_name);
    }
  }
}

function validateAssociations(
  associations: unknown,
  serviceKeys: Set<string>,
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): void {
  if (associations === undefined || associations === null) return;

  if (!Array.isArray(associations)) {
    addError(errors, 'associations', 'associations must be an array');
    return;
  }

  const seenTuples = new Set<string>();

  for (let i = 0; i < associations.length; i++) {
    const entry = associations[i];
    const path = `associations[${i}]`;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      addError(errors, path, 'Association entry must be an object');
      continue;
    }

    const assoc = entry as Record<string, unknown>;

    // Warn on unknown fields
    warnUnknownKeys(assoc, KNOWN_ASSOCIATION_FIELDS, path, warnings);

    // Required: service_key
    if (!isNonEmptyString(assoc.service_key)) {
      addError(errors, `${path}.service_key`, 'service_key is required and must be a non-empty string');
      continue;
    }

    // Required: dependency_name
    if (!isNonEmptyString(assoc.dependency_name)) {
      addError(errors, `${path}.dependency_name`, 'dependency_name is required and must be a non-empty string');
      continue;
    }

    // Required: association_type (valid enum)
    if (!isNonEmptyString(assoc.association_type)) {
      addError(errors, `${path}.association_type`, 'association_type is required and must be a non-empty string');
      continue;
    }
    if (!VALID_ASSOCIATION_TYPES.includes(assoc.association_type as any)) {
      addError(
        errors,
        `${path}.association_type`,
        `association_type must be one of: ${VALID_ASSOCIATION_TYPES.join(', ')}`,
      );
      continue;
    }

    // service_key must reference a key in the services array
    if (!serviceKeys.has(assoc.service_key)) {
      addError(
        errors,
        `${path}.service_key`,
        `service_key "${assoc.service_key}" does not match any service key in the manifest`,
      );
    }

    // Duplicate tuple check (service_key + dependency_name + association_type)
    const tuple = `${assoc.service_key}|${assoc.dependency_name}|${assoc.association_type}`;
    if (seenTuples.has(tuple)) {
      addError(
        errors,
        path,
        `Duplicate association: service_key="${assoc.service_key}", dependency_name="${assoc.dependency_name}", association_type="${assoc.association_type}"`,
      );
    } else {
      seenTuples.add(tuple);
    }
  }
}

// --- Level 3: Cross-Reference Checks ---

function crossReferenceChecks(
  services: unknown[],
  errors: ManifestValidationIssue[],
  warnings: ManifestValidationIssue[],
): Set<string> {
  const seenKeys = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const validKeys = new Set<string>();

  for (let i = 0; i < services.length; i++) {
    const entry = services[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;

    const svc = entry as Record<string, unknown>;

    if (isNonEmptyString(svc.key)) {
      const prev = seenKeys.get(svc.key);
      if (prev !== undefined) {
        addError(errors, `services[${i}].key`, `Duplicate key "${svc.key}" (first seen at services[${prev}])`);
      } else {
        seenKeys.set(svc.key, i);
        validKeys.add(svc.key);
      }
    }

    if (isNonEmptyString(svc.name)) {
      const prev = seenNames.get(svc.name);
      if (prev !== undefined) {
        addWarning(warnings, `services[${i}].name`, `Duplicate name "${svc.name}" (first seen at services[${prev}])`);
      } else {
        seenNames.set(svc.name, i);
      }
    }
  }

  return validKeys;
}

// --- Public API ---

/**
 * Validate a parsed manifest JSON object.
 * Returns a structured result with all errors and warnings.
 * Each section is validated independently — failure in one does not block others.
 */
export function validateManifest(data: unknown): ManifestValidationResult {
  const errors: ManifestValidationIssue[] = [];
  const warnings: ManifestValidationIssue[] = [];

  // Level 1: Structure validation
  const { valid: structureValid, version, obj } = validateStructure(data, errors, warnings);

  if (!structureValid || !obj) {
    return {
      valid: false,
      version,
      service_count: 0,
      valid_count: 0,
      errors,
      warnings,
    };
  }

  const services = obj.services as unknown[];

  // Level 2: Per-service entry validation
  let validCount = 0;
  for (let i = 0; i < services.length; i++) {
    if (validateServiceEntry(services[i], i, errors, warnings)) {
      validCount++;
    }
  }

  // Level 3: Cross-reference checks (duplicate keys/names)
  const serviceKeys = crossReferenceChecks(services, errors, warnings);

  // Level 2/3: Optional section validation
  validateAliases(obj.aliases, errors, warnings);
  validateCanonicalOverrides(obj.canonical_overrides, errors, warnings);
  validateAssociations(obj.associations, serviceKeys, errors, warnings);

  return {
    valid: errors.length === 0,
    version: 1,
    service_count: services.length,
    valid_count: validCount,
    errors,
    warnings,
  };
}
