#!/usr/bin/env node
/**
 * Kills any processes running on dev ports (3000, 3001, 3100-3110)
 * Used to clean up orphaned processes on Windows where process trees
 * aren't properly terminated when concurrently exits.
 */

const { execSync } = require('child_process');

const PORTS = [3000, 3001, 4000];

function getProcessOnPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const lines = output.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        pids.add(pid);
      }
    }

    return Array.from(pids);
  } catch {
    return [];
  }
}

function killProcess(pid) {
  try {
    execSync(`taskkill /F /T /PID ${pid}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  let killedAny = false;

  for (const port of PORTS) {
    const pids = getProcessOnPort(port);
    for (const pid of pids) {
      console.log(`Killing process ${pid} on port ${port}...`);
      if (killProcess(pid)) {
        killedAny = true;
        console.log(`  Killed PID ${pid}`);
      }
    }
  }

  if (!killedAny) {
    console.log('No orphaned dev processes found.');
  }
}

main();
