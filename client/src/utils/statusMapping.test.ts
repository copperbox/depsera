import { getHealthBadgeStatus, getHealthStateBadgeStatus } from './statusMapping';

describe('getHealthBadgeStatus', () => {
  it('returns healthy for healthy status', () => {
    expect(getHealthBadgeStatus('healthy')).toBe('healthy');
  });

  it('returns warning for warning status', () => {
    expect(getHealthBadgeStatus('warning')).toBe('warning');
  });

  it('returns critical for critical status', () => {
    expect(getHealthBadgeStatus('critical')).toBe('critical');
  });

  it('returns unknown for unknown status', () => {
    expect(getHealthBadgeStatus('unknown')).toBe('unknown');
  });

  it('returns unknown for any other status', () => {
    expect(getHealthBadgeStatus('something-else')).toBe('unknown');
    expect(getHealthBadgeStatus('')).toBe('unknown');
  });
});

describe('getHealthStateBadgeStatus', () => {
  it('returns unknown when both healthy and health_state are null', () => {
    expect(getHealthStateBadgeStatus({ healthy: null, health_state: null })).toBe('unknown');
  });

  it('returns critical when healthy is 0', () => {
    expect(getHealthStateBadgeStatus({ healthy: 0, health_state: null })).toBe('critical');
    expect(getHealthStateBadgeStatus({ healthy: 0, health_state: 0 })).toBe('critical');
  });

  it('returns critical when health_state is 2', () => {
    expect(getHealthStateBadgeStatus({ healthy: null, health_state: 2 })).toBe('critical');
    expect(getHealthStateBadgeStatus({ healthy: 1, health_state: 2 })).toBe('critical');
  });

  it('returns warning when health_state is 1', () => {
    expect(getHealthStateBadgeStatus({ healthy: null, health_state: 1 })).toBe('warning');
    expect(getHealthStateBadgeStatus({ healthy: 1, health_state: 1 })).toBe('warning');
  });

  it('returns healthy for other cases', () => {
    expect(getHealthStateBadgeStatus({ healthy: 1, health_state: null })).toBe('healthy');
    expect(getHealthStateBadgeStatus({ healthy: 1, health_state: 0 })).toBe('healthy');
  });
});
