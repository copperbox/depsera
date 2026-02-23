import path from 'path';
import fs from 'fs';
import { clientBuildExists, createStaticMiddleware } from './staticFiles';

jest.mock('fs');
jest.mock('compression', () => {
  const mock = jest.fn((_req: unknown, _res: unknown, next: () => void) => next());
  return jest.fn(() => mock);
});

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('staticFiles', () => {
  describe('clientBuildExists', () => {
    it('returns true when client/dist/index.html exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      expect(clientBuildExists()).toBe(true);
      const calledPath = mockedFs.existsSync.mock.calls[0][0] as string;
      expect(calledPath).toContain(path.join('client', 'dist', 'index.html'));
    });

    it('returns false when client/dist/index.html does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      expect(clientBuildExists()).toBe(false);
    });
  });

  describe('createStaticMiddleware', () => {
    it('returns an array of three middleware handlers', () => {
      const middleware = createStaticMiddleware();
      expect(middleware).toHaveLength(3);
      middleware.forEach((mw) => {
        expect(typeof mw).toBe('function');
      });
    });

    it('SPA fallback sends index.html with no-cache headers', () => {
      const middleware = createStaticMiddleware();
      const spaFallback = middleware[2];

      const req = {};
      const res = {
        setHeader: jest.fn(),
        sendFile: jest.fn(),
      };
      const next = jest.fn();

      spaFallback(req as unknown, res as unknown, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      const sentPath = res.sendFile.mock.calls[0][0] as string;
      expect(sentPath).toContain(path.join('client', 'dist', 'index.html'));
    });
  });
});
