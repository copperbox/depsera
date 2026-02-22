import path from 'path';
import fs from 'fs';
import express, { RequestHandler } from 'express';
import compression from 'compression';

/**
 * Resolves the client dist directory path.
 * In production (running from server/dist/), the client build is at ../../client/dist/.
 * In development (running from server/src/ via ts-node), it's at ../../client/dist/.
 * Either way, we go up from the server package root to the repo root, then into client/dist.
 */
function getClientDistPath(): string {
  // __dirname will be server/dist/middleware or server/src/middleware
  // Go up to server/, then up to repo root, then into client/dist
  return path.resolve(__dirname, '..', '..', '..', 'client', 'dist');
}

/**
 * Returns true if the client dist directory exists and contains an index.html.
 */
export function clientBuildExists(): boolean {
  const distPath = getClientDistPath();
  const indexPath = path.join(distPath, 'index.html');
  return fs.existsSync(indexPath);
}

/**
 * Creates middleware to serve the built client application.
 * Returns an array of middleware handlers: compression, static files, and SPA catch-all.
 */
export function createStaticMiddleware(): RequestHandler[] {
  const distPath = getClientDistPath();

  const compressionMiddleware = compression() as RequestHandler;

  // Hashed assets (js, css, images) get long cache; index.html gets no-cache
  const staticMiddleware = express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    index: false, // Don't serve index.html for directory requests — the catch-all handles it
  });

  // SPA catch-all: any non-API request that didn't match a static file gets index.html
  const spaFallback: RequestHandler = (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  };

  return [compressionMiddleware, staticMiddleware, spaFallback];
}
