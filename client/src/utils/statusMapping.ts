import type { BadgeStatus } from '../components/common/StatusBadge';

/**
 * Interface for objects with health state properties (Dependency, DependentReport)
 */
interface HealthStateObject {
  healthy: number | null;
  health_state: number | null;
}

/**
 * Maps a service health status string to a BadgeStatus
 * @param status - The health status string from the service
 * @returns The corresponding BadgeStatus
 */
export function getHealthBadgeStatus(status: string): BadgeStatus {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'critical';
    default:
      return 'unknown';
  }
}

/**
 * Maps a health state object (Dependency or DependentReport) to a BadgeStatus
 * Used for dependencies and dependent reports that have healthy/health_state fields
 * @param obj - Object with healthy and health_state properties
 * @returns The corresponding BadgeStatus
 */
export function getHealthStateBadgeStatus(obj: HealthStateObject): BadgeStatus {
  if (obj.healthy === null && obj.health_state === null) {
    return 'unknown';
  }
  if (obj.healthy === 0 || obj.health_state === 2) {
    return 'critical';
  }
  if (obj.health_state === 1) {
    return 'warning';
  }
  return 'healthy';
}
