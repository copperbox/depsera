import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UserRole } from '../../db/types';
import { hashPassword } from '../../auth/localAuth';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

const MIN_PASSWORD_LENGTH = 8;

export function createUser(req: Request, res: Response): void {
  try {
    const { email, name, password, role } = req.body;
    const stores = getStores();

    // Validate required fields
    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    // Validate role if provided
    const validRoles: UserRole[] = ['admin', 'user'];
    const userRole = role || 'user';
    if (!validRoles.includes(userRole)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check for duplicate email
    if (stores.users.existsByEmail(email.trim())) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    // Hash password and create user
    const passwordHash = hashPassword(password);
    const user = stores.users.create({
      email: email.trim(),
      name: name.trim(),
      password_hash: passwordHash,
      role: userRole,
    });

    auditFromRequest(req, 'user.created', 'user', user.id, {
      email: user.email,
      role: user.role,
    });

    // Return user without password_hash
    const { password_hash: _hash, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'creating user');
  }
}
