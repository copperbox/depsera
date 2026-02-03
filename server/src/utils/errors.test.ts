import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  formatError,
  getErrorStatusCode,
  errorHandler,
  asyncHandler,
  wrapHandler,
} from './errors';

describe('Error classes', () => {
  describe('AppError', () => {
    it('should create error with status code', () => {
      const error = new AppError('Test error', 500);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should allow non-operational errors', () => {
      const error = new AppError('Test error', 500, false);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('should create 400 error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBeUndefined();
    });

    it('should include field name', () => {
      const error = new ValidationError('Invalid input', 'email');
      expect(error.field).toBe('email');
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error with resource name', () => {
      const error = new NotFoundError('User');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
      expect(error.resource).toBe('User');
    });
  });

  describe('ConflictError', () => {
    it('should create 409 error', () => {
      const error = new ConflictError('Already exists');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create 401 error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Not authenticated');
    });

    it('should allow custom message', () => {
      const error = new UnauthorizedError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('ForbiddenError', () => {
    it('should create 403 error with default message', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    it('should allow custom message', () => {
      const error = new ForbiddenError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });
});

describe('formatError', () => {
  it('should format ValidationError with field', () => {
    const error = new ValidationError('Invalid email', 'email');
    const formatted = formatError(error);

    expect(formatted.error).toBe('Invalid email');
    expect(formatted.field).toBe('email');
  });

  it('should format ValidationError without field', () => {
    const error = new ValidationError('Invalid input');
    const formatted = formatError(error);

    expect(formatted.error).toBe('Invalid input');
    expect(formatted.field).toBeUndefined();
  });

  it('should format AppError', () => {
    const error = new NotFoundError('User');
    const formatted = formatError(error);

    expect(formatted.error).toBe('User not found');
  });

  it('should format regular Error', () => {
    const error = new Error('Something went wrong');
    const formatted = formatError(error);

    expect(formatted.error).toBe('Internal server error');
    expect(formatted.message).toBe('Something went wrong');
  });

  it('should format unknown error', () => {
    const formatted = formatError('string error');

    expect(formatted.error).toBe('Internal server error');
    expect(formatted.message).toBe('Unknown error');
  });
});

describe('getErrorStatusCode', () => {
  it('should return AppError status code', () => {
    expect(getErrorStatusCode(new NotFoundError('User'))).toBe(404);
    expect(getErrorStatusCode(new ValidationError('Invalid'))).toBe(400);
    expect(getErrorStatusCode(new ConflictError('Exists'))).toBe(409);
  });

  it('should return 500 for non-AppError', () => {
    expect(getErrorStatusCode(new Error('Regular error'))).toBe(500);
    expect(getErrorStatusCode('string error')).toBe(500);
  });
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockReq = { method: 'GET', path: '/test' };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    consoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('should handle client errors without logging', () => {
    const error = new NotFoundError('User');
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('should log server errors', () => {
    const error = new Error('Server error');
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('should call next with caught error', async () => {
    const error = new Error('Async error');
    const handler = asyncHandler(async () => {
      throw error;
    });

    handler(mockReq as Request, mockRes as Response, mockNext);

    // Wait for promise to settle
    await new Promise(resolve => setImmediate(resolve));

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should not call next on success', async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    });

    handler(mockReq as Request, mockRes as Response, mockNext);

    await new Promise(resolve => setImmediate(resolve));

    expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('wrapHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    consoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('should call handler normally on success', () => {
    const handler = wrapHandler((_req, res) => {
      res.json({ ok: true });
    }, 'test operation');

    handler(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should catch errors and format response', () => {
    const handler = wrapHandler(() => {
      throw new ValidationError('Invalid', 'field');
    }, 'test operation');

    handler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid', field: 'field' });
    expect(consoleError).toHaveBeenCalled();
  });
});
