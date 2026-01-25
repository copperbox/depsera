export enum FailureMode {
  OUTAGE = 'outage',
  HIGH_LATENCY = 'high_latency',
  ERROR = 'error',
  INTERMITTENT = 'intermittent'
}

export interface FailureConfig {
  latencyMs?: number;
  errorRate?: number;
  errorCode?: number;
  errorMessage?: string;
}

export interface FailureState {
  mode: FailureMode;
  config: FailureConfig;
  appliedAt: Date;
  cascade: boolean;
  isCascaded?: boolean;
  sourceServiceId?: string;
}

export interface FailureScenario {
  name: string;
  description: string;
  targetTier?: string;
  targetServices?: string[];
  mode: FailureMode;
  config: FailureConfig;
  cascade: boolean;
}

export const PREDEFINED_SCENARIOS: FailureScenario[] = [
  {
    name: 'database-outage',
    description: 'All database services become unavailable',
    targetTier: 'database',
    mode: FailureMode.OUTAGE,
    config: {},
    cascade: true
  },
  {
    name: 'api-latency',
    description: 'High latency across all API services',
    targetTier: 'api',
    mode: FailureMode.HIGH_LATENCY,
    config: { latencyMs: 5000 },
    cascade: false
  },
  {
    name: 'backend-errors',
    description: 'All backend services return errors',
    targetTier: 'backend',
    mode: FailureMode.ERROR,
    config: { errorCode: 500, errorMessage: 'Internal Server Error' },
    cascade: true
  },
  {
    name: 'cache-flapping',
    description: 'Cache services are intermittently failing',
    targetTier: 'database',
    mode: FailureMode.INTERMITTENT,
    config: { errorRate: 0.5 },
    cascade: true
  }
];
