import { Dependency, Service, DependencyAssociation } from '../../db/types';

// Formatted association with linked service
export interface FormattedAssociation extends DependencyAssociation {
  linked_service: Service;
}

// Formatted dependency with associations
export interface FormattedDependencyWithAssociations extends Dependency {
  associations: FormattedAssociation[];
}

// Latency statistics for a dependency
export interface FormattedLatencyStats {
  avgLatencyMs24h: number | null;
  minLatencyMs24h: number | null;
  maxLatencyMs24h: number | null;
  dataPointCount: number;
}

/**
 * Format an association with its linked service
 */
export function formatAssociation(
  association: DependencyAssociation,
  linkedService: Service
): FormattedAssociation {
  return {
    ...association,
    linked_service: linkedService,
  };
}

/**
 * Format a dependency with its associations
 */
export function formatDependencyWithAssociations(
  dependency: Dependency,
  associations: FormattedAssociation[]
): FormattedDependencyWithAssociations {
  return {
    ...dependency,
    associations,
  };
}

/**
 * Format a single dependency for response
 */
export function formatDependency(dependency: Dependency): Dependency {
  return { ...dependency };
}

/**
 * Aggregate latency statistics from a list of dependencies
 */
export function aggregateLatencyStats(dependencies: Dependency[]): FormattedLatencyStats {
  const latencies = dependencies
    .map((d) => d.latency_ms)
    .filter((l): l is number => l !== null);

  if (latencies.length === 0) {
    return {
      avgLatencyMs24h: null,
      minLatencyMs24h: null,
      maxLatencyMs24h: null,
      dataPointCount: 0,
    };
  }

  const sum = latencies.reduce((acc, l) => acc + l, 0);
  return {
    avgLatencyMs24h: Math.round(sum / latencies.length),
    minLatencyMs24h: Math.min(...latencies),
    maxLatencyMs24h: Math.max(...latencies),
    dataPointCount: latencies.length,
  };
}
