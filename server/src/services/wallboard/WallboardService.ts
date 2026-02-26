import { getStores } from '../../stores';
import { DependencyForWallboard } from '../../stores/types';
import { DependencyCanonicalOverride } from '../../db/types';
import { resolveContact, resolveImpact } from '../../utils/overrideResolver';
import {
  WallboardDependency,
  WallboardHealthStatus,
  WallboardReporter,
  WallboardResponse,
  WallboardTeam,
} from './types';

/**
 * Normalize a dependency name for dedup grouping.
 * Uses canonical_name when available, falls back to name.
 */
function normalizeDepName(dep: DependencyForWallboard): string {
  return (dep.canonical_name ?? dep.name).toLowerCase().trim();
}

/**
 * Compute the grouping key for deduplication.
 * Prefers linked service ID (so deps linked to the same service merge),
 * falls back to normalized canonical name / raw name.
 */
function getGroupKey(dep: DependencyForWallboard): string {
  if (dep.target_service_id) {
    return `linked:${dep.target_service_id}`;
  }
  return `name:${normalizeDepName(dep)}`;
}

/**
 * Map health_state (0=OK, 1=WARNING, 2=CRITICAL) + healthy flag to WallboardHealthStatus.
 */
function resolveHealthStatus(dep: DependencyForWallboard): WallboardHealthStatus {
  if (dep.skipped === 1) return 'skipped';
  if (dep.healthy === null && dep.health_state === null) return 'unknown';
  if (dep.health_state === 2) return 'critical';
  if (dep.health_state === 1) return 'warning';
  if (dep.healthy === 1) return 'healthy';
  if (dep.healthy === 0) return 'critical';
  return 'unknown';
}

/** Priority for worst-status-wins aggregation (higher = worse) */
const STATUS_PRIORITY: Record<WallboardHealthStatus, number> = {
  skipped: -1,
  unknown: 0,
  healthy: 1,
  warning: 2,
  critical: 3,
};

/**
 * Pick the worst health status from a list (critical > warning > healthy > unknown).
 */
function worstStatus(statuses: WallboardHealthStatus[]): WallboardHealthStatus {
  if (statuses.length === 0) return 'unknown';
  let worst = statuses[0];
  for (let i = 1; i < statuses.length; i++) {
    if (STATUS_PRIORITY[statuses[i]] > STATUS_PRIORITY[worst]) {
      worst = statuses[i];
    }
  }
  return worst;
}

/**
 * Find the most common value in an array.
 */
function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = values[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

export class WallboardService {
  getWallboardData(teamIds?: string[]): WallboardResponse {
    const stores = getStores();
    let rows = stores.dependencies.findAllForWallboard();

    // Fetch canonical overrides once for efficient resolution
    const canonicalOverrides = stores.canonicalOverrides.findAll();
    const canonicalOverrideMap = new Map<string, DependencyCanonicalOverride>(
      canonicalOverrides.map((o) => [o.canonical_name, o]),
    );

    // Filter by team IDs if provided (for non-admin scoping)
    if (teamIds && teamIds.length > 0) {
      const teamIdSet = new Set(teamIds);
      rows = rows.filter((r) => teamIdSet.has(r.service_team_id));
    }

    // Group by linked service ID (when available) or normalized name
    const groups = new Map<string, DependencyForWallboard[]>();
    for (const row of rows) {
      const key = getGroupKey(row);
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    // Collect unique teams
    const teamMap = new Map<string, string>();
    for (const row of rows) {
      if (!teamMap.has(row.service_team_id)) {
        teamMap.set(row.service_team_id, row.service_team_name);
      }
    }
    const teams: WallboardTeam[] = Array.from(teamMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Build WallboardDependency for each group
    const dependencies: WallboardDependency[] = [];

    for (const [, deps] of groups) {
      // Primary = most recently checked dependency in the group
      const primary = deps.reduce((best, dep) => {
        if (!best.last_checked) return dep;
        if (!dep.last_checked) return best;
        return dep.last_checked > best.last_checked ? dep : best;
      });

      // Health: worst status wins
      const healthStatuses = deps.map(resolveHealthStatus);
      const health_status = worstStatus(healthStatuses);

      // Latency: aggregate min/avg/max across all reporters with latency data
      const latencyValues = deps
        .map((d) => d.latency_ms)
        .filter((v): v is number => v !== null);
      const latency = latencyValues.length > 0
        ? {
          min: Math.round(Math.min(...latencyValues)),
          avg: Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length),
          max: Math.round(Math.max(...latencyValues)),
        }
        : null;

      // Type: most common
      const type = mostCommon(deps.map((d) => d.type));

      // Last checked: most recent across all reporters
      const lastCheckedValues = deps
        .map((d) => d.last_checked)
        .filter((v): v is string => v !== null);
      const last_checked = lastCheckedValues.length > 0
        ? lastCheckedValues.sort().pop()!
        : null;

      // Error message: from primary (most recently checked)
      const error_message = primary.error_message ?? null;

      // Impact: from primary or first non-null
      const impact = primary.impact ?? deps.find((d) => d.impact !== null)?.impact ?? null;

      // Description: from primary or first non-null
      const description = primary.description ?? deps.find((d) => d.description !== null)?.description ?? null;

      // Resolved overrides: use primary's 3-tier hierarchy
      const canonicalOverride = primary.canonical_name
        ? canonicalOverrideMap.get(primary.canonical_name)
        : undefined;

      const effective_contact = resolveContact(
        primary.contact,
        canonicalOverride?.contact_override ?? null,
        primary.contact_override,
      );

      const effective_impact = resolveImpact(
        primary.impact,
        canonicalOverride?.impact_override ?? null,
        primary.impact_override,
      );

      // Linked service: from first reporter with an association
      const linkedDep = deps.find((d) => d.target_service_id !== null);
      const linked_service = linkedDep && linkedDep.target_service_id
        ? { id: linkedDep.target_service_id, name: linkedDep.linked_service_name ?? '' }
        : null;

      // Reporters
      const reporters: WallboardReporter[] = deps.map((d) => ({
        dependency_id: d.id,
        service_id: d.service_id,
        service_name: d.service_name,
        service_team_id: d.service_team_id,
        service_team_name: d.service_team_name,
        healthy: d.healthy,
        health_state: d.health_state,
        latency_ms: d.latency_ms,
        last_checked: d.last_checked,
        skipped: d.skipped,
      }));

      // Unique team IDs across all reporters
      const team_ids = [...new Set(deps.map((d) => d.service_team_id))];

      // Display name: prefer linked service name (when grouped by linked service),
      // then canonical_name, then raw name from the primary
      const displayName = linked_service
        ? linked_service.name
        : (primary.canonical_name ?? primary.name);

      dependencies.push({
        canonical_name: displayName,
        primary_dependency_id: primary.id,
        health_status,
        type,
        latency,
        last_checked,
        error_message,
        impact,
        description,
        effective_contact,
        effective_impact,
        linked_service,
        reporters,
        team_ids,
      });
    }

    // Sort by health status (worst first), then alphabetically
    dependencies.sort((a, b) => {
      const priorityDiff = STATUS_PRIORITY[b.health_status] - STATUS_PRIORITY[a.health_status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.canonical_name.localeCompare(b.canonical_name);
    });

    return { dependencies, teams };
  }
}
