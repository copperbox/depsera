import { Request, Response, NextFunction } from 'express';
import { requireLocalAuth } from './middleware';

// Mock the localAuth module
jest.mock('./localAuth', () => ({
  getAuthMode: jest.fn(),
}));

// Mock authorizationService to prevent import errors
jest.mock('./authorizationService', () => ({
  AuthorizationService: {},
}));

// Mock stores
jest.mock('../stores', () => ({
  getStores: jest.fn(),
}));

import { getAuthMode } from './localAuth';

const mockedGetAuthMode = getAuthMode as jest.MockedFunction<typeof getAuthMode>;

describe('requireLocalAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() when auth mode is local', () => {
    mockedGetAuthMode.mockReturnValue('local');

    requireLocalAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 404 when auth mode is oidc', () => {
    mockedGetAuthMode.mockReturnValue('oidc');

    requireLocalAuth(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

});
