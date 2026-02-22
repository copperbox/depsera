import { Router } from 'express';
import { login } from './login';
import { callback } from './callback';
import { logout } from './logout';
import { me } from './me';
import { localLogin } from './localLogin';
import { mode } from './mode';
import { requireAuth } from '../../auth/middleware';
import { getAuthMode } from '../../auth/localAuth';

const router = Router();

// Public routes
router.get('/mode', mode);
router.get('/login', login);
router.get('/callback', callback);

// Local auth login — only active in local auth mode
router.post('/login', (req, res, next) => {
  if (getAuthMode() !== 'local') {
    res.status(404).json({ error: 'Local auth is not enabled' });
    return;
  }
  localLogin(req, res).catch(next);
});

// Protected routes
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
