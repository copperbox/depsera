import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ServiceRegistry } from '../services/service-registry';
import { FailureController } from '../failures/failure-controller';
import { generateTopology } from '../topology/generator';
import { InjectFailureRequest, ResetRequest, ApiResponse } from './types';

export interface ControlRoutesConfig {
  registry: ServiceRegistry;
  failureController: FailureController;
}

function jsonResponse<T>(res: http.ServerResponse, status: number, data: ApiResponse<T>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getUiPath(filePath: string): string {
  // Check if running from dist (compiled) or src (ts-node dev)
  const distPath = path.join(__dirname, '..', 'ui', filePath);
  if (fs.existsSync(distPath)) {
    return distPath;
  }
  // Fallback to src/ui when running compiled code from dist
  const srcPath = path.join(__dirname, '..', '..', 'src', 'ui', filePath);
  return srcPath;
}

function serveStaticFile(res: http.ServerResponse, filePath: string, contentType: string): void {
  try {
    const fullPath = getUiPath(filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('File not found');
  }
}

export function createControlRoutes(config: ControlRoutesConfig) {
  const { registry, failureController } = config;

  return {
    async handle(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathParts: string[]
    ): Promise<void> {
      const method = req.method || 'GET';

      if (pathParts.length === 0 || pathParts[0] === '' || pathParts[0] === 'ui') {
        serveStaticFile(res, 'index.html', 'text/html');
        return;
      }

      if (pathParts[0] === 'styles.css') {
        serveStaticFile(res, 'styles.css', 'text/css');
        return;
      }

      if (pathParts[0] === 'app.js') {
        serveStaticFile(res, 'app.js', 'application/javascript');
        return;
      }

      if (pathParts[0] !== 'api') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const apiPath = pathParts.slice(1);

      try {
        if (method === 'GET' && apiPath[0] === 'topology') {
          const topology = registry.getTopology();
          jsonResponse(res, 200, { success: true, data: topology });
          return;
        }

        if (method === 'GET' && apiPath[0] === 'services' && apiPath.length === 1) {
          const services = await registry.getAllServiceStatuses();
          jsonResponse(res, 200, { success: true, data: services });
          return;
        }

        if (method === 'GET' && apiPath[0] === 'services' && apiPath.length === 2) {
          const health = await registry.getServiceHealth(apiPath[1]);
          if (!health) {
            jsonResponse(res, 404, { success: false, error: 'Service not found' });
            return;
          }
          const service = registry.getService(apiPath[1]);
          jsonResponse(res, 200, {
            success: true,
            data: {
              id: service?.id,
              name: service?.name,
              tier: service?.tier,
              health,
              failureState: service?.getFailureState()
            }
          });
          return;
        }

        if (method === 'POST' && apiPath[0] === 'services' && apiPath[2] === 'failure') {
          const body = await parseJsonBody<InjectFailureRequest>(req);
          try {
            failureController.injectFailure(apiPath[1], {
              mode: body.mode,
              config: body.config || {},
              appliedAt: new Date(),
              cascade: body.cascade ?? true
            });
            jsonResponse(res, 200, { success: true });
          } catch (err) {
            jsonResponse(res, 400, {
              success: false,
              error: err instanceof Error ? err.message : 'Failed to inject failure'
            });
          }
          return;
        }

        if (method === 'DELETE' && apiPath[0] === 'services' && apiPath[2] === 'failure') {
          failureController.clearFailure(apiPath[1]);
          jsonResponse(res, 200, { success: true });
          return;
        }

        if (method === 'GET' && apiPath[0] === 'failures') {
          const failures = failureController.getActiveFailuresArray();
          jsonResponse(res, 200, { success: true, data: failures });
          return;
        }

        if (method === 'DELETE' && apiPath[0] === 'failures') {
          failureController.clearAllFailures();
          jsonResponse(res, 200, { success: true });
          return;
        }

        if (method === 'GET' && apiPath[0] === 'scenarios') {
          const scenarios = failureController.getScenarios();
          jsonResponse(res, 200, { success: true, data: scenarios });
          return;
        }

        if (method === 'POST' && apiPath[0] === 'scenarios' && apiPath.length === 2) {
          try {
            failureController.applyScenario(apiPath[1]);
            jsonResponse(res, 200, { success: true });
          } catch (err) {
            jsonResponse(res, 400, {
              success: false,
              error: err instanceof Error ? err.message : 'Failed to apply scenario'
            });
          }
          return;
        }

        if (method === 'POST' && apiPath[0] === 'reset') {
          const body = await parseJsonBody<ResetRequest>(req);
          const count = body.count || 20;
          const newTopology = generateTopology({ totalServices: count });
          registry.reset(newTopology);
          failureController.updateTopology(newTopology);
          failureController.setRegistry(registry);
          registry.startAll();
          jsonResponse(res, 200, { success: true, data: { topology: newTopology } });
          return;
        }

        jsonResponse(res, 404, { success: false, error: 'Endpoint not found' });

      } catch (err) {
        console.error('API error:', err);
        jsonResponse(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : 'Internal server error'
        });
      }
    }
  };
}
