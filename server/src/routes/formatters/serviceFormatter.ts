import { Service, Team, Dependency, DependentReport } from '../../db/types';
import { ServiceWithTeam } from '../../stores/types';
import { calculateAggregatedHealth } from '../../utils/serviceHealth';
import { getStores } from '../../stores';
import {
  FormattedTeam,
  FormattedServiceListItem,
  FormattedServiceDetail,
  FormattedServiceMutation,
  LocalHealthStatus,
} from './types';

/**
 * Format a team object from a joined service row
 */
export function formatTeamFromRow(row: ServiceWithTeam): FormattedTeam {
  return {
    id: row.team_id,
    name: row.team_name,
    description: row.team_description ?? null,
    created_at: row.team_created_at ?? row.created_at,
    updated_at: row.team_updated_at ?? row.updated_at,
  };
}

/**
 * Extract base service fields from a row
 */
function extractServiceFields(row: Service | ServiceWithTeam) {
  return {
    id: row.id,
    name: row.name,
    team_id: row.team_id,
    health_endpoint: row.health_endpoint,
    metrics_endpoint: row.metrics_endpoint,
    poll_interval_ms: row.poll_interval_ms,
    is_active: row.is_active,
    last_poll_success: row.last_poll_success ?? null,
    last_poll_error: row.last_poll_error ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Calculate local health status from a service's own dependencies
 */
export function calculateLocalHealth(dependencies: Dependency[]): LocalHealthStatus {
  const healthyCount = dependencies.filter((d) => d.healthy === 1).length;
  const unhealthyCount = dependencies.filter((d) => d.healthy === 0).length;
  const totalCount = dependencies.length;

  let status: LocalHealthStatus['status'] = 'unknown';
  if (totalCount === 0) {
    status = 'unknown';
  } else if (unhealthyCount > 0) {
    status = 'unhealthy';
  } else if (healthyCount === totalCount) {
    status = 'healthy';
  } else {
    status = 'degraded';
  }

  return {
    status,
    healthy_count: healthyCount,
    unhealthy_count: unhealthyCount,
    total_dependencies: totalCount,
  };
}

/**
 * Format a service for list endpoints (includes aggregated health from dependents)
 */
export function formatServiceListItem(row: ServiceWithTeam): FormattedServiceListItem {
  const aggregatedHealth = calculateAggregatedHealth(row.id);

  return {
    ...extractServiceFields(row),
    team: formatTeamFromRow(row),
    health: aggregatedHealth,
  };
}

/**
 * Format a service for detail endpoint (includes dependencies and dependent reports)
 */
export function formatServiceDetail(
  row: ServiceWithTeam,
  dependencies: Dependency[],
  dependentReports: DependentReport[]
): FormattedServiceDetail {
  const aggregatedHealth = calculateAggregatedHealth(row.id, dependencies);

  return {
    ...extractServiceFields(row),
    team: formatTeamFromRow(row),
    dependencies,
    health: aggregatedHealth,
    dependent_reports: dependentReports,
  };
}

/**
 * Format a service for create/update endpoints (includes local health status)
 */
export function formatServiceMutation(
  service: Service,
  team: Team,
  dependencies: Dependency[]
): FormattedServiceMutation {
  return {
    ...extractServiceFields(service),
    team,
    dependencies,
    health: calculateLocalHealth(dependencies),
  };
}

/**
 * Format a newly created service (empty dependencies)
 */
export function formatNewService(service: Service, team: Team): FormattedServiceMutation {
  return formatServiceMutation(service, team, []);
}

/**
 * Format an updated service (fetch current dependencies)
 */
export function formatUpdatedService(serviceId: string): FormattedServiceMutation | null {
  const stores = getStores();
  const service = stores.services.findByIdWithTeam(serviceId);

  if (!service) {
    return null;
  }

  const dependencies = stores.dependencies.findByServiceId(serviceId);
  const team: Team = {
    id: service.team_id,
    name: service.team_name,
    description: service.team_description ?? null,
    created_at: service.team_created_at ?? service.created_at,
    updated_at: service.team_updated_at ?? service.updated_at,
  };

  return formatServiceMutation(service, team, dependencies);
}
