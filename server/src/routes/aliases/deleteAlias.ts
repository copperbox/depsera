import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function deleteAlias(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const deleted = getStores().aliases.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Alias not found' });
      return;
    }

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting alias');
  }
}
