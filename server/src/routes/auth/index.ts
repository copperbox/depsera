import { Router } from 'express';
import { login } from './login';
import { callback } from './callback';
import { logout } from './logout';
import { me } from './me';
import { requireAuth } from '../../auth/middleware';

const router = Router();

// Public routes
router.get('/login', login);
router.get('/callback', callback);

// Protected routes
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
