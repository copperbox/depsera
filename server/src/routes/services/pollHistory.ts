import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getServicePollHistory(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Verify service exists
    const service = stores.services.findById(id);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const errorCount = stores.servicePollHistory.getErrorCount24h(id);
    const entries = stores.servicePollHistory.getByServiceId(id, 50);

    const formattedEntries = entries.map(e => ({
      error: e.error,
      recordedAt: e.recorded_at,
      isRecovery: e.error === null,
    }));

    res.json({
      serviceId: id,
      errorCount,
      entries: formattedEntries,
    });
  } catch (error) /* istanbul ignore next */ {
    sendErrorResponse(res, error, 'fetching service poll history');
  }
}
