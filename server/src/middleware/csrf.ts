import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Parse a specific cookie from the Cookie header.
 */
function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

/**
 * Double-submit cookie CSRF protection middleware.
 *
 * - Sets a `csrf-token` cookie (readable by JS) on responses when one isn't present
 * - Validates that mutating requests (POST/PUT/DELETE) include an `X-CSRF-Token`
 *   header matching the cookie value
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const existingToken = getCookie(req, CSRF_COOKIE_NAME);

  // Ensure a CSRF cookie exists
  if (!existingToken) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Client JS needs to read this
      sameSite: 'lax',
      secure: req.secure,
      path: '/',
    });
  }

  // Safe methods don't need CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Validate CSRF token for mutating requests
  const cookieToken = existingToken;
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'Invalid or missing CSRF token' });
    return;
  }

  next();
}
