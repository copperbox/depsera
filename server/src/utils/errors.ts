import { Request, Response, NextFunction } from 'express';

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
 * Format an error for JSON response
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

  if (error instanceof Error) {
    return {
      error: 'Internal server error',
      message: error.message,
    };
  }

  return {
    error: 'Internal server error',
    message: 'Unknown error',
  };
}

/**
 * Get status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
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
