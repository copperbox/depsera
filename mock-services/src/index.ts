import * as path from 'path';
import { parseArgs } from 'util';
import { generateTopology, getTopologyStats } from './topology';
import { ServiceRegistry } from './services';
import { FailureController } from './failures';
import { createServer } from './server';
import { seedMockServices, clearMockServices } from './seed';

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', short: 'c', default: '20' },
    port: { type: 'string', short: 'p', default: '4000' },
    seed: { type: 'boolean', short: 's', default: false },
    reset: { type: 'boolean', short: 'r', default: false },
    'db-path': { type: 'string', default: '../server/data/database.sqlite' }
  }
});

const count = parseInt(args.count as string, 10);
const port = parseInt(args.port as string, 10);
const dbPath = path.resolve(__dirname, '..', args['db-path'] as string);

console.log('='.repeat(50));
console.log('Mock Services for Dependencies Dashboard');
console.log('='.repeat(50));
console.log('');

if (args.reset) {
  console.log('Resetting mock services...');
  clearMockServices(dbPath, `http://localhost:${port}`);
}

console.log(`Generating topology with ${count} services...`);
const topology = generateTopology({ totalServices: count });
const stats = getTopologyStats(topology);

console.log('');
console.log('Topology Statistics:');
console.log(`  Total services: ${stats.total}`);
console.log(`  Total edges: ${stats.edges}`);
console.log(`  Frontend: ${stats.frontend}`);
console.log(`  API: ${stats.api}`);
console.log(`  Backend: ${stats.backend}`);
console.log(`  Database: ${stats.database}`);
console.log('');

const registry = new ServiceRegistry(topology);
const failureController = new FailureController(topology);
failureController.setRegistry(registry);

if (args.seed || args.reset) {
  console.log(`Seeding mock services to dashboard database...`);
  console.log(`Database path: ${dbPath}`);
  seedMockServices({
    databasePath: dbPath,
    registry,
    mockServicesBaseUrl: `http://localhost:${port}`
  });
  console.log('');
}

if (args.reset && !args.seed) {
  console.log('Reset complete. Exiting.');
  process.exit(0);
}

const server = createServer({ port, registry, failureController });

registry.startAll();

server.listen(port, () => {
  console.log('='.repeat(50));
  console.log(`Mock services running on http://localhost:${port}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('Endpoints:');
  console.log(`  Control UI: http://localhost:${port}/control/`);
  console.log('');

  const exampleService = registry.getAllServices()[0];
  if (exampleService) {
    console.log('Example service endpoints:');
    console.log(`  Health:       http://localhost:${port}/${exampleService.name}/health`);
    console.log(`  Dependencies: http://localhost:${port}/${exampleService.name}/dependencies`);
    console.log(`  Metrics:      http://localhost:${port}/${exampleService.name}/metrics`);
  }
  console.log('');
  console.log('Press Ctrl+C to stop');
});

function shutdown() {
  console.log('\nShutting down...');
  registry.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds if server doesn't close gracefully
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(0);
  }, 5000);
}

// Handle various shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Windows-specific: handle Ctrl+C in terminals that don't send SIGINT
if (process.platform === 'win32') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('close', shutdown);
}
