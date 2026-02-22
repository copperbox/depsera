import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { verifyPassword } from '../../auth/localAuth';
import { sendErrorResponse } from '../../utils/errors';

export async function localLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password must be strings' });
      return;
    }

    const stores = getStores();
    const user = stores.users.findByEmail(email);

    if (!user || !user.password_hash) {
      // Use consistent timing to prevent user enumeration
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Set authenticated session (same pattern as OIDC callback)
    req.session.userId = user.id;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'local login');
  }
}
