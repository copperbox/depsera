import { FailureMode, PREDEFINED_SCENARIOS } from './types';

describe('FailureMode', () => {
  it('should include UNRESPONSIVE mode', () => {
    expect(FailureMode.UNRESPONSIVE).toBe('unresponsive');
  });
});

describe('PREDEFINED_SCENARIOS', () => {
  it('should include service-unresponsive scenario', () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === 'service-unresponsive');
    expect(scenario).toBeDefined();
    expect(scenario!.mode).toBe(FailureMode.UNRESPONSIVE);
    expect(scenario!.targetTier).toBe('api');
    expect(scenario!.cascade).toBe(false);
  });
});
