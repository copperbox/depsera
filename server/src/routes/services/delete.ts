import { Request, Response } from 'express';
import db from '../../db';
import { Service } from '../../db/types';

export function deleteService(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    // Check if service exists
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Delete service (cascades to dependencies and associations)
    db.prepare('DELETE FROM services WHERE id = ?').run(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({
      error: 'Failed to delete service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
