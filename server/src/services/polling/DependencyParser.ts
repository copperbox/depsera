import { ProactiveDepsStatus, DependencyType, DEPENDENCY_TYPES } from '../../db/types';

/**
 * Parses health endpoint responses into ProactiveDepsStatus objects.
 * Handles both nested and flat response formats.
 */
export class DependencyParser {
  /**
   * Parse a health endpoint response into an array of dependency statuses.
   * @param data - The raw response data (expected to be an array)
   * @returns Array of parsed ProactiveDepsStatus objects
   * @throws Error if the data format is invalid
   */
  parse(data: unknown): ProactiveDepsStatus[] {
    if (!Array.isArray(data)) {
      throw new Error('Invalid response: expected array');
    }

    return data.map((item, index) => this.parseItem(item, index));
  }

  /**
   * Parse a single dependency item from the response.
   */
  private parseItem(item: unknown, index: number): ProactiveDepsStatus {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Invalid dependency at index ${index}: expected object`);
    }

    const dep = item as Record<string, unknown>;

    if (typeof dep.name !== 'string') {
      throw new Error(`Invalid dependency at index ${index}: missing name`);
    }

    if (typeof dep.healthy !== 'boolean') {
      throw new Error(`Invalid dependency at index ${index}: missing healthy`);
    }

    // Parse health data from either nested or flat format
    const health = this.parseHealthData(dep);

    // Parse and validate type field
    const depType = this.parseType(dep.type);

    // Parse optional check details
    const checkDetails = this.parseCheckDetails(dep.checkDetails);

    // Parse error fields
    const error = dep.error !== undefined ? dep.error : undefined;
    const errorMessage = typeof dep.errorMessage === 'string' ? dep.errorMessage : undefined;

    return {
      name: dep.name as string,
      description: typeof dep.description === 'string' ? dep.description : undefined,
      impact: typeof dep.impact === 'string' ? dep.impact : undefined,
      type: depType,
      healthy: dep.healthy as boolean,
      health,
      lastChecked: typeof dep.lastChecked === 'string' ? dep.lastChecked : new Date().toISOString(),
      checkDetails,
      error,
      errorMessage,
    };
  }

  /**
   * Parse health data from either nested or flat format.
   */
  private parseHealthData(dep: Record<string, unknown>): ProactiveDepsStatus['health'] {
    let healthState = 0;
    let healthCode = 200;
    let latency = 0;

    if (dep.health && typeof dep.health === 'object') {
      // Nested format: { health: { state, code, latency } }
      const health = dep.health as Record<string, unknown>;
      healthState = typeof health.state === 'number' ? health.state : 0;
      healthCode = typeof health.code === 'number' ? health.code : 200;
      latency = typeof health.latency === 'number' ? health.latency : 0;
    } else {
      // Flat format from mock-services: { healthCode, latencyMs }
      healthCode = typeof dep.healthCode === 'number' ? dep.healthCode : 200;
      latency = typeof dep.latencyMs === 'number' ? dep.latencyMs : 0;
      // Derive state from healthy status
      healthState = dep.healthy ? 0 : 2;
    }

    return {
      state: healthState as 0 | 1 | 2,
      code: healthCode,
      latency,
    };
  }

  /**
   * Parse and validate dependency type.
   */
  private parseType(type: unknown): DependencyType {
    if (typeof type === 'string' && DEPENDENCY_TYPES.includes(type as DependencyType)) {
      return type as DependencyType;
    }
    return 'other';
  }

  /**
   * Parse check details if present.
   */
  private parseCheckDetails(checkDetails: unknown): Record<string, unknown> | undefined {
    if (checkDetails && typeof checkDetails === 'object') {
      return checkDetails as Record<string, unknown>;
    }
    return undefined;
  }
}

/**
 * Singleton instance for convenience
 */
let parserInstance: DependencyParser | null = null;

export function getDependencyParser(): DependencyParser {
  if (!parserInstance) {
    parserInstance = new DependencyParser();
  }
  return parserInstance;
}
