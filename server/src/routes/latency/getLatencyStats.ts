import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { LatencyStats, LatencyDataPoint } from '../../db/types';

interface LatencyStatsResponse extends LatencyStats {
  dependencyId: string;
  currentLatencyMs: number | null;
  dataPoints: LatencyDataPoint[];
}

export function getLatencyStats(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const stores = getStores();

    /* istanbul ignore if -- Route param always present; validation for type safety */
    if (!dependencyId) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    // Get current latency from dependencies table
    const dependency = stores.dependencies.findById(dependencyId);

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get 24-hour stats
    const stats = stores.latencyHistory.getStats24h(dependencyId);

    // Get data points for chart (last 24 hours, max 100 points)
    const dataPoints = stores.latencyHistory.getHistory(dependencyId, { limit: 100 });

    const response: LatencyStatsResponse = {
      dependencyId,
      currentLatencyMs: dependency.latency_ms,
      avgLatencyMs24h: stats.avgLatencyMs24h,
      minLatencyMs24h: stats.minLatencyMs24h,
      maxLatencyMs24h: stats.maxLatencyMs24h,
      dataPointCount: stats.dataPointCount,
      dataPoints,
    };

    res.json(response);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error fetching latency stats:', error);
    res.status(500).json({
      error: 'Failed to fetch latency stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
