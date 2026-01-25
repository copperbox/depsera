import { Request, Response } from 'express';
import db from '../../db';
import { LatencyStats, LatencyDataPoint } from '../../db/types';

interface LatencyStatsResponse extends LatencyStats {
  dependencyId: string;
  currentLatencyMs: number | null;
  dataPoints: LatencyDataPoint[];
}

interface DependencyRow {
  latency_ms: number | null;
}

interface StatsRow {
  avg_latency: number | null;
  min_latency: number | null;
  max_latency: number | null;
  count: number;
}

export function getLatencyStats(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;

    if (!dependencyId) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    // Get current latency from dependencies table
    const dependency = db.prepare(`
      SELECT latency_ms FROM dependencies WHERE id = ?
    `).get(dependencyId) as DependencyRow | undefined;

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get 24-hour stats
    const stats = db.prepare(`
      SELECT
        AVG(latency_ms) as avg_latency,
        MIN(latency_ms) as min_latency,
        MAX(latency_ms) as max_latency,
        COUNT(*) as count
      FROM dependency_latency_history
      WHERE dependency_id = ?
        AND recorded_at >= datetime('now', '-24 hours')
    `).get(dependencyId) as StatsRow;

    // Get data points for chart (last 24 hours, max 100 points)
    const dataPoints = db.prepare(`
      SELECT latency_ms, recorded_at
      FROM dependency_latency_history
      WHERE dependency_id = ?
        AND recorded_at >= datetime('now', '-24 hours')
      ORDER BY recorded_at ASC
      LIMIT 100
    `).all(dependencyId) as LatencyDataPoint[];

    const response: LatencyStatsResponse = {
      dependencyId,
      currentLatencyMs: dependency.latency_ms,
      avgLatencyMs24h: stats.avg_latency ? Math.round(stats.avg_latency) : null,
      minLatencyMs24h: stats.min_latency,
      maxLatencyMs24h: stats.max_latency,
      dataPointCount: stats.count,
      dataPoints,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching latency stats:', error);
    res.status(500).json({
      error: 'Failed to fetch latency stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
