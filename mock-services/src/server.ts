import * as http from 'http';
import { ServiceRegistry } from './services/service-registry';
import { FailureController } from './failures/failure-controller';
import { FailureMode } from './failures/types';
import { createControlRoutes } from './control/api-routes';

export interface ServerConfig {
  port: number;
  registry: ServiceRegistry;
  failureController: FailureController;
}

export function createServer(config: ServerConfig): http.Server {
  const { port, registry, failureController } = config;
  const controlRoutes = createControlRoutes({ registry, failureController });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const pathParts = url.pathname.split('/').filter(Boolean);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathParts[0] === 'control') {
        await controlRoutes.handle(req, res, pathParts.slice(1));
        return;
      }

      if (pathParts.length === 2 && (pathParts[1] === 'health' || pathParts[1] === 'dependencies')) {
        // If unresponsive, never respond — request hangs until caller times out
        if (registry.getServiceFailureMode(pathParts[0]) === FailureMode.UNRESPONSIVE) {
          return;
        }
      }

      if (pathParts.length === 2 && pathParts[1] === 'health') {
        await handleServiceHealth(registry, pathParts[0], res);
        return;
      }

      if (pathParts.length === 2 && pathParts[1] === 'dependencies') {
        await handleServiceDependencies(registry, pathParts[0], res);
        return;
      }

      if (pathParts.length === 2 && pathParts[1] === 'metrics') {
        await handleServiceMetrics(registry, pathParts[0], res);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/alert-webhook') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        const teamName = req.headers['x-team-name'] || '(none)';
        console.log(`\n[ALERT WEBHOOK] Team: ${teamName}`);
        console.log(JSON.stringify(body, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathParts.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Mock Services API',
          endpoints: {
            control: '/control/',
            health: '/{service-name}/health',
            dependencies: '/{service-name}/dependencies',
            metrics: '/{service-name}/metrics'
          }
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  return server;
}

async function handleServiceHealth(
  registry: ServiceRegistry,
  serviceName: string,
  res: http.ServerResponse
): Promise<void> {
  const health = await registry.getServiceHealth(serviceName);

  if (!health) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Service ${serviceName} not found` }));
    return;
  }

  const statusCode = health.healthy ? 200 : 503;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health));
}

async function handleServiceDependencies(
  registry: ServiceRegistry,
  serviceName: string,
  res: http.ServerResponse
): Promise<void> {
  const service = registry.getService(serviceName);

  if (!service) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Service ${serviceName} not found` }));
    return;
  }

  const statuses = await service.getDependencyStatuses();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(statuses));
}

async function handleServiceMetrics(
  registry: ServiceRegistry,
  serviceName: string,
  res: http.ServerResponse
): Promise<void> {
  const service = registry.getService(serviceName);

  if (!service) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('# Service not found\n');
    return;
  }

  const metrics = await service.getMetrics();
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(metrics);
}
