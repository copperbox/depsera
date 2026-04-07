import { ProactiveDepsStatus, HealthState } from '../../db/types';
import { TraceDependency } from './TraceParser';

/**
 * Extended ProactiveDepsStatus that carries the discovery source for
 * trace-discovered dependencies. The trace route reads this field
 * when building DependencyUpsertInput.
 */
export interface TraceBridgedDepsStatus extends ProactiveDepsStatus {
  discovery_source: 'otlp_trace';
}

/**
 * Thin adapter converting TraceDependency[] (from TraceParser) to
 * ProactiveDepsStatus[] for the existing DependencyUpsertService pipeline.
 *
 * Deduplicates by target name: averages latency, any-error-wins.
 */
export class TraceDependencyBridge {
  /**
   * Convert trace-extracted dependencies into the ProactiveDepsStatus shape
   * consumed by DependencyUpsertService.upsert().
   */
  bridgeToDepsStatus(traceDeps: TraceDependency[]): TraceBridgedDepsStatus[] {
    // Group by targetName for deduplication (handles merged results)
    const grouped = new Map<
      string,
      {
        totalLatency: number;
        count: number;
        isError: boolean;
        type: string;
        description: string;
      }
    >();

    for (const dep of traceDeps) {
      const existing = grouped.get(dep.targetName);
      if (existing) {
        existing.totalLatency += dep.latencyMs;
        existing.count += 1;
        if (dep.isError) existing.isError = true;
      } else {
        grouped.set(dep.targetName, {
          totalLatency: dep.latencyMs,
          count: 1,
          isError: dep.isError,
          type: dep.type,
          description: dep.description,
        });
      }
    }

    const now = new Date().toISOString();

    return Array.from(grouped.entries()).map(([name, agg]) => {
      const state: HealthState = agg.isError ? 2 : 0;
      const latency = Math.round(agg.totalLatency / agg.count);

      return {
        name,
        description: agg.description || undefined,
        type: agg.type,
        healthy: !agg.isError,
        health: {
          state,
          code: agg.isError ? 500 : 200,
          latency,
        },
        lastChecked: now,
        discovery_source: 'otlp_trace' as const,
      };
    });
  }
}
