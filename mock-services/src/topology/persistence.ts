import * as fs from 'fs';
import * as path from 'path';
import { Topology } from './types';

const DEFAULT_TOPOLOGY_FILE = 'topology.json';

export interface TopologyPersistenceConfig {
  filePath?: string;
}

/**
 * Save a topology to a JSON file for later reuse.
 */
export function saveTopology(
  topology: Topology,
  config: TopologyPersistenceConfig = {}
): string {
  const filePath = config.filePath || path.join(__dirname, '..', '..', DEFAULT_TOPOLOGY_FILE);

  const data = {
    version: 1,
    createdAt: new Date().toISOString(),
    topology,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * Load a topology from a JSON file.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadTopology(
  config: TopologyPersistenceConfig = {}
): Topology | null {
  const filePath = config.filePath || path.join(__dirname, '..', '..', DEFAULT_TOPOLOGY_FILE);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.topology || !Array.isArray(data.topology.services)) {
      console.warn('Invalid topology file format');
      return null;
    }

    return data.topology as Topology;
  } catch (error) {
    console.warn('Failed to load topology file:', error);
    return null;
  }
}

/**
 * Check if a topology file exists.
 */
export function topologyExists(config: TopologyPersistenceConfig = {}): boolean {
  const filePath = config.filePath || path.join(__dirname, '..', '..', DEFAULT_TOPOLOGY_FILE);
  return fs.existsSync(filePath);
}

/**
 * Delete the topology file.
 */
export function deleteTopology(config: TopologyPersistenceConfig = {}): boolean {
  const filePath = config.filePath || path.join(__dirname, '..', '..', DEFAULT_TOPOLOGY_FILE);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Get the default topology file path.
 */
export function getDefaultTopologyPath(): string {
  return path.join(__dirname, '..', '..', DEFAULT_TOPOLOGY_FILE);
}
