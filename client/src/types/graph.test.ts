import { getServiceHealthStatus, getEdgeHealthStatus } from './graph';
import type { ServiceNodeData, GraphEdgeData } from './graph';

describe('getServiceHealthStatus', () => {
  const baseNodeData: ServiceNodeData = {
    name: 'Test Service',
    teamId: 't1',
    teamName: 'Team A',
    healthEndpoint: '/health',
    isActive: true,
    dependencyCount: 0,
    healthyCount: 0,
    unhealthyCount: 0,
    lastPollSuccess: null,
    lastPollError: null,
    reportedHealthyCount: 0,
    reportedUnhealthyCount: 0,
  };

  describe('when there are dependent reports', () => {
    it('returns critical when there are unhealthy reports', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        reportedHealthyCount: 5,
        reportedUnhealthyCount: 1,
      };
      expect(getServiceHealthStatus(data)).toBe('critical');
    });

    it('returns healthy when all reports are healthy', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        reportedHealthyCount: 5,
        reportedUnhealthyCount: 0,
      };
      expect(getServiceHealthStatus(data)).toBe('healthy');
    });
  });

  describe('when there are no dependent reports', () => {
    it('returns unknown when no dependencies are counted', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        healthyCount: 0,
        unhealthyCount: 0,
      };
      expect(getServiceHealthStatus(data)).toBe('unknown');
    });

    it('returns healthy when 80% or more dependencies are healthy', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        healthyCount: 8,
        unhealthyCount: 2,
      };
      expect(getServiceHealthStatus(data)).toBe('healthy');
    });

    it('returns warning when 50-79% dependencies are healthy', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        healthyCount: 5,
        unhealthyCount: 5,
      };
      expect(getServiceHealthStatus(data)).toBe('warning');
    });

    it('returns critical when less than 50% dependencies are healthy', () => {
      const data: ServiceNodeData = {
        ...baseNodeData,
        healthyCount: 2,
        unhealthyCount: 8,
      };
      expect(getServiceHealthStatus(data)).toBe('critical');
    });
  });
});

describe('getEdgeHealthStatus', () => {
  it('returns unknown when healthy is null', () => {
    const data: GraphEdgeData = {
      relationship: 'depends_on',
      healthy: null,
    };
    expect(getEdgeHealthStatus(data)).toBe('unknown');
  });

  it('returns unknown when healthy is undefined', () => {
    const data: GraphEdgeData = {
      relationship: 'depends_on',
      healthy: undefined,
    };
    expect(getEdgeHealthStatus(data)).toBe('unknown');
  });

  it('returns critical when healthy is false', () => {
    const data: GraphEdgeData = {
      relationship: 'depends_on',
      healthy: false,
    };
    expect(getEdgeHealthStatus(data)).toBe('critical');
  });

  it('returns healthy when healthy is true', () => {
    const data: GraphEdgeData = {
      relationship: 'depends_on',
      healthy: true,
    };
    expect(getEdgeHealthStatus(data)).toBe('healthy');
  });
});
