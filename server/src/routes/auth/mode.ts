import { Request, Response } from 'express';
import { getAuthMode } from '../../auth/localAuth';

export function mode(_req: Request, res: Response): void {
  res.json({ mode: getAuthMode() });
}
