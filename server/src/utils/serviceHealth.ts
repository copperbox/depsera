import { getStores, StoreRegistry } from '../stores';
import type { IDependencyStore } from '../stores/interfaces';
import { DependentReport } from '../stores/types';
import { Dependency } from '../db/types';

// Re-export DependentReport from stores for backward compatibility
export type { DependentReport };

// Health status based on dependent reports
export type AggregatedHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'unknown';

// Thresholds for health status calculation (percentages)
export const HEALTH_THRESHOLDS = {
  HEALTHY_PERCENTAGE: 80, // >= 80% healthy reports = healthy
  WARNING_PERCENTAGE: 50, // >= 50% healthy reports = warning
  // < 50% = critical
};

export interface AggregatedHealth {
  status: AggregatedHealthStatus;
  healthy_reports: number;
  warning_reports: number;
  critical_reports: number;
  total_reports: number;
  dependent_count: number;
  last_report: string | null;
}

/**
 * Get all dependency reports where other services report on this service.
 * Uses dependency_associations to find which dependencies are linked to this service.
 */
export function getDependentReports(serviceId: string, stores?: StoreRegistry): DependentReport[] {
  const dependencyStore = (stores || getStores()).dependencies;
  return dependencyStore.findDependentReports(serviceId);
}

/**
 * Calculate aggregated health status for a service based on what dependents report about it.
 * When no dependents exist but dependencies are provided, derives status from dependency health.
 */
export function calculateAggregatedHealth(serviceId: string, dependencies?: Dependency[]): AggregatedHealth {
  const reports = getDependentReports(serviceId);

  if (reports.length === 0) {
    // No dependents — derive status from own dependencies if available
    if (dependencies && dependencies.length > 0) {
      let healthyCount = 0;
      let warningCount = 0;
      let criticalCount = 0;

      for (const dep of dependencies) {
        if (dep.health_state === 2 || dep.healthy === 0) {
          criticalCount++;
        } else if (dep.health_state === 1) {
          warningCount++;
        } else if (dep.healthy === 1) {
          healthyCount++;
        }
      }

      const countedDeps = healthyCount + warningCount + criticalCount;
      const healthyPercentage = countedDeps > 0 ? (healthyCount / countedDeps) * 100 : 0;

      let status: AggregatedHealthStatus;
      if (countedDeps === 0) {
        status = 'unknown';
      } else if (healthyPercentage >= HEALTH_THRESHOLDS.HEALTHY_PERCENTAGE) {
        status = 'healthy';
      } else if (healthyPercentage >= HEALTH_THRESHOLDS.WARNING_PERCENTAGE) {
        status = 'warning';
      } else {
        status = 'critical';
      }

      return {
        status,
        healthy_reports: healthyCount,
        warning_reports: warningCount,
        critical_reports: criticalCount,
        total_reports: dependencies.length,
        dependent_count: 0,
        last_report: dependencies.reduce<string | null>((latest, dep) => {
          if (!dep.last_checked) return latest;
          if (!latest) return dep.last_checked;
          return dep.last_checked > latest ? dep.last_checked : latest;
        }, null),
      };
    }

    return {
      status: 'unknown',
      healthy_reports: 0,
      warning_reports: 0,
      critical_reports: 0,
      total_reports: 0,
      dependent_count: 0,
      last_report: null,
    };
  }

  // Categorize reports by health state
  let healthyCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  const dependentServiceIds = new Set<string>();

  for (const report of reports) {
    dependentServiceIds.add(report.reporting_service_id);

    // Use health_state for granular status, fall back to healthy boolean
    if (report.health_state === 2 || report.healthy === 0) {
      criticalCount++;
    } else if (report.health_state === 1) {
      warningCount++;
    } else if (report.healthy === 1) {
      healthyCount++;
    }
    // null healthy/health_state = unknown, not counted in percentage
  }

  const countedReports = healthyCount + warningCount + criticalCount;
  const healthyPercentage =
    countedReports > 0 ? (healthyCount / countedReports) * 100 : 0;

  let status: AggregatedHealthStatus;
  if (countedReports === 0) {
    // Have reports but all have null health values
    status = 'unknown';
  } else if (healthyPercentage >= HEALTH_THRESHOLDS.HEALTHY_PERCENTAGE) {
    status = 'healthy';
  } else if (healthyPercentage >= HEALTH_THRESHOLDS.WARNING_PERCENTAGE) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  return {
    status,
    healthy_reports: healthyCount,
    warning_reports: warningCount,
    critical_reports: criticalCount,
    total_reports: reports.length,
    dependent_count: dependentServiceIds.size,
    last_report: reports[0]?.last_checked || null,
  };
}
