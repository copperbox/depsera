import { Request, Response } from 'express';
import db from '../../db';
import { Service } from '../../db/types';
import { HealthPollingService } from '../../services/polling';

export async function pollServiceNow(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Verify service exists
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    if (!service.is_active) {
      res.status(400).json({ error: 'Service is not active' });
      return;
    }

    // Trigger immediate poll
    const pollingService = HealthPollingService.getInstance();
    const result = await pollingService.pollNow(id);

    res.json({
      success: result.success,
      dependencies_updated: result.dependenciesUpdated,
      status_changes: result.statusChanges.length,
      latency_ms: result.latencyMs,
      error: result.error,
    });
  } catch (error) {
    console.error('Error triggering poll:', error);
    res.status(500).json({
      error: 'Failed to poll service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
