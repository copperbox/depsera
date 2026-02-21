import { Request, Response, NextFunction } from 'express';
import { InvalidOrderByError } from '../stores/orderByValidator';

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - validation errors
 */
export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 400);
    this.field = field;
  }
}

/**
 * 404 Not Found - resource not found
 */
export class NotFoundError extends AppError {
  public readonly resource: string;

  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.resource = resource;
  }
}

/**
 * 409 Conflict - duplicate or already exists
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/**
 * 401 Unauthorized - not authenticated
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden - insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  field?: string;
}

/**
 * Format an error for JSON response.
 * AppError subclasses are considered operational and their messages are safe
 * to return to clients. All other errors get a generic message to prevent
 * leaking internal details (stack traces, file paths, IPs, schema info).
 */
export function formatError(error: unknown): ErrorResponse {
  if (error instanceof ValidationError) {
    return {
      error: error.message,
      ...(error.field && { field: error.field }),
    };
  }

  if (error instanceof AppError) {
    return { error: error.message };
  }

  // InvalidOrderByError is a client input validation error — safe to expose
  if (error instanceof InvalidOrderByError) {
    return { error: error.message };
  }

  // Never expose raw error messages for non-operational errors
  return { error: 'Internal server error' };
}

/**
 * Get status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (error instanceof InvalidOrderByError) {
    return 400;
  }
  return 500;
}

/**
 * Express error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = getErrorStatusCode(error);
  const response = formatError(error);

  // Log server errors
  if (statusCode >= 500) {
    console.error(`[${req.method}] ${req.path}:`, error);
  }

  res.status(statusCode).json(response);
}

/**
 * Async route handler wrapper that catches errors and forwards to error middleware
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Sync route handler wrapper with standardized error handling
 * Use this for sync handlers to get consistent error response format
 */
export type RouteHandler = (req: Request, res: Response) => void;

export function wrapHandler(
  handler: RouteHandler,
  errorContext: string
): RouteHandler {
  return (req: Request, res: Response): void => {
    try {
      handler(req, res);
    } catch (error) {
      console.error(`Error ${errorContext}:`, error);
      const statusCode = getErrorStatusCode(error);
      const response = formatError(error);
      res.status(statusCode).json(response);
    }
  };
}

/**
 * Send a standardized error response. Logs the full error server-side
 * and returns a sanitized response to the client.
 */
export function sendErrorResponse(
  res: Response,
  error: unknown,
  context: string,
): void {
  console.error(`Error ${context}:`, error);
  const statusCode = getErrorStatusCode(error);
  res.status(statusCode).json(formatError(error));
}

/**
 * Patterns that indicate internal details in error messages.
 */
const PRIVATE_IP_PATTERN = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})\b/;
const URL_PATTERN = /https?:\/\/[^\s,)]+/gi;
const FILE_PATH_PATTERN = /(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+/g;

/**
 * Known fetch/network error patterns mapped to safe messages.
 */
const ERROR_SANITIZATION_MAP: Array<{ pattern: RegExp; replacement: string | ((match: string) => string) }> = [
  { pattern: /ECONNREFUSED/i, replacement: 'Connection refused' },
  { pattern: /ECONNRESET/i, replacement: 'Connection reset' },
  { pattern: /ETIMEDOUT/i, replacement: 'Connection timed out' },
  { pattern: /ENOTFOUND/i, replacement: 'DNS lookup failed' },
  { pattern: /EHOSTUNREACH/i, replacement: 'Host unreachable' },
  { pattern: /ENETUNREACH/i, replacement: 'Network unreachable' },
  { pattern: /ECONNABORTED/i, replacement: 'Connection aborted' },
  { pattern: /EPIPE/i, replacement: 'Connection broken' },
  { pattern: /abort/i, replacement: 'Request timed out' },
  { pattern: /certificate/i, replacement: 'TLS certificate error' },
  { pattern: /self[- ]signed/i, replacement: 'TLS certificate error' },
  { pattern: /^HTTP \d{3}:/i, replacement: (match: string) => match.split(':')[0] },
];

/**
 * Sanitize a poll error message before storing in the database.
 * Strips internal URLs, private IPs, and file paths.
 * Maps known error codes to safe descriptions.
 */
export function sanitizePollError(errorMessage: string): string {
  if (!errorMessage) return errorMessage;

  // Check for known error patterns and return the safe replacement
  for (const { pattern, replacement } of ERROR_SANITIZATION_MAP) {
    const match = pattern.exec(errorMessage);
    if (match) {
      if (typeof replacement === 'function') {
        return replacement(match[0]);
      }
      return replacement;
    }
  }

  // Strip internal details from the message
  let sanitized = errorMessage;
  sanitized = sanitized.replace(URL_PATTERN, '[redacted-url]');
  sanitized = sanitized.replace(PRIVATE_IP_PATTERN, '[redacted-ip]');
  sanitized = sanitized.replace(FILE_PATH_PATTERN, '[redacted-path]');

  // Truncate to prevent excessively long error messages
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }

  return sanitized;
}
