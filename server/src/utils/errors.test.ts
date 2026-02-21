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
  sendErrorResponse,
  sanitizePollError,
} from './errors';
import { InvalidOrderByError } from '../stores/orderByValidator';

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

  it('should not leak raw error message for non-operational errors', () => {
    const error = new Error('ECONNREFUSED 192.168.1.1:5432 - password auth failed');
    const formatted = formatError(error);

    expect(formatted.error).toBe('Internal server error');
    expect(formatted.message).toBeUndefined();
  });

  it('should not leak unknown error details', () => {
    const formatted = formatError('string error with internal details');

    expect(formatted.error).toBe('Internal server error');
    expect(formatted.message).toBeUndefined();
  });

  it('should format InvalidOrderByError as client-safe', () => {
    const error = new InvalidOrderByError('Invalid order_by column: foo');
    const formatted = formatError(error);

    expect(formatted.error).toBe('Invalid order_by column: foo');
  });
});

describe('getErrorStatusCode', () => {
  it('should return AppError status code', () => {
    expect(getErrorStatusCode(new NotFoundError('User'))).toBe(404);
    expect(getErrorStatusCode(new ValidationError('Invalid'))).toBe(400);
    expect(getErrorStatusCode(new ConflictError('Exists'))).toBe(409);
  });

  it('should return 400 for InvalidOrderByError', () => {
    expect(getErrorStatusCode(new InvalidOrderByError('Invalid order_by'))).toBe(400);
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

  it('should sanitize body-parser SyntaxError (no stack trace leak)', () => {
    const error = new SyntaxError('Unexpected token i in JSON at position 0');
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
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

describe('sendErrorResponse', () => {
  let mockRes: Partial<Response>;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    consoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('should send sanitized error for non-operational errors', () => {
    const error = new Error('ECONNREFUSED 10.0.0.1:5432');
    sendErrorResponse(mockRes as Response, error, 'test');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(consoleError).toHaveBeenCalledWith('Error test:', error);
  });

  it('should pass through AppError messages', () => {
    const error = new NotFoundError('Service');
    sendErrorResponse(mockRes as Response, error, 'test');

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service not found' });
  });

  it('should handle InvalidOrderByError', () => {
    const error = new InvalidOrderByError('Invalid order_by column: bad_col');
    sendErrorResponse(mockRes as Response, error, 'test');

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid order_by column: bad_col' });
  });
});

describe('sanitizePollError', () => {
  it('should return empty string for empty input', () => {
    expect(sanitizePollError('')).toBe('');
  });

  it('should map ECONNREFUSED to safe message', () => {
    expect(sanitizePollError('connect ECONNREFUSED 10.0.0.1:3000')).toBe('Connection refused');
  });

  it('should map ECONNRESET to safe message', () => {
    expect(sanitizePollError('read ECONNRESET')).toBe('Connection reset');
  });

  it('should map ETIMEDOUT to safe message', () => {
    expect(sanitizePollError('connect ETIMEDOUT 192.168.1.100:443')).toBe('Connection timed out');
  });

  it('should map ENOTFOUND to safe message', () => {
    expect(sanitizePollError('getaddrinfo ENOTFOUND internal.corp.net')).toBe('DNS lookup failed');
  });

  it('should map EHOSTUNREACH to safe message', () => {
    expect(sanitizePollError('connect EHOSTUNREACH 172.16.0.1:80')).toBe('Host unreachable');
  });

  it('should map ENETUNREACH to safe message', () => {
    expect(sanitizePollError('connect ENETUNREACH 10.10.0.1:8080')).toBe('Network unreachable');
  });

  it('should map ECONNABORTED to safe message', () => {
    expect(sanitizePollError('socket hang up ECONNABORTED')).toBe('Connection aborted');
  });

  it('should map EPIPE to safe message', () => {
    expect(sanitizePollError('write EPIPE')).toBe('Connection broken');
  });

  it('should map abort errors to safe message', () => {
    expect(sanitizePollError('The operation was aborted')).toBe('Request timed out');
  });

  it('should map certificate errors to safe message', () => {
    expect(sanitizePollError('unable to verify the first certificate')).toBe('TLS certificate error');
  });

  it('should map self-signed certificate errors to safe message', () => {
    expect(sanitizePollError('self signed certificate in certificate chain')).toBe('TLS certificate error');
    expect(sanitizePollError('self-signed certificate')).toBe('TLS certificate error');
  });

  it('should strip HTTP status prefix to just the code', () => {
    expect(sanitizePollError('HTTP 503: Service Unavailable')).toBe('HTTP 503');
  });

  it('should strip private IPs from unknown error messages', () => {
    const result = sanitizePollError('Failed to connect to 192.168.1.100 on port 5432');
    expect(result).not.toContain('192.168.1.100');
    expect(result).toContain('[redacted-ip]');
  });

  it('should strip RFC1918 10.x.x.x addresses', () => {
    const result = sanitizePollError('Connection to 10.0.0.5 refused');
    expect(result).not.toContain('10.0.0.5');
    expect(result).toContain('[redacted-ip]');
  });

  it('should strip 172.16-31.x.x addresses', () => {
    const result = sanitizePollError('Timeout connecting to 172.20.0.1');
    expect(result).not.toContain('172.20.0.1');
    expect(result).toContain('[redacted-ip]');
  });

  it('should strip loopback addresses', () => {
    const result = sanitizePollError('Error at 127.0.0.1:3000');
    expect(result).not.toContain('127.0.0.1');
    expect(result).toContain('[redacted-ip]');
  });

  it('should strip link-local addresses', () => {
    const result = sanitizePollError('Found 169.254.1.1 unreachable');
    expect(result).not.toContain('169.254.1.1');
    expect(result).toContain('[redacted-ip]');
  });

  it('should strip URLs from error messages', () => {
    const result = sanitizePollError('Failed to fetch https://internal.corp.net/api/health');
    expect(result).not.toContain('internal.corp.net');
    expect(result).toContain('[redacted-url]');
  });

  it('should strip file paths from error messages', () => {
    const result = sanitizePollError('Error in /app/server/src/services/polling.ts');
    expect(result).not.toContain('/app/server/src');
    expect(result).toContain('[redacted-path]');
  });

  it('should strip Windows file paths', () => {
    const result = sanitizePollError('Error in C:\\Users\\admin\\project\\server.ts');
    expect(result).not.toContain('C:\\Users\\admin');
    expect(result).toContain('[redacted-path]');
  });

  it('should truncate messages longer than 200 chars', () => {
    const longMessage = 'A'.repeat(300);
    const result = sanitizePollError(longMessage);
    expect(result.length).toBe(203); // 200 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('should not truncate messages 200 chars or shorter', () => {
    const message = 'A'.repeat(200);
    const result = sanitizePollError(message);
    expect(result).toBe(message);
  });

  it('should pass through clean messages unchanged', () => {
    expect(sanitizePollError('Service returned invalid JSON')).toBe('Service returned invalid JSON');
  });
});
