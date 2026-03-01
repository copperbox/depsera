import { WallboardService } from './WallboardService';
import { DependencyForWallboard } from '../../stores/types';

// Mock getStores
const mockFindAllForWallboard = jest.fn();
const mockFindAllCanonicalOverrides = jest.fn();

jest.mock('../../stores', () => ({
  getStores: () => ({
    dependencies: {
      findAllForWallboard: mockFindAllForWallboard,
    },
    canonicalOverrides: {
      findAll: mockFindAllCanonicalOverrides,
    },
  }),
}));

function makeDep(overrides: Partial<DependencyForWallboard> = {}): DependencyForWallboard {
  return {
    id: 'dep-1',
    service_id: 'svc-1',
    name: 'TestDep',
    canonical_name: null,
    description: null,
    impact: null,
    type: 'database',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 50,
    contact: null,
    contact_override: null,
    impact_override: null,
    check_details: null,
    error: null,
    error_message: null,
    skipped: 0,
    last_checked: '2025-01-01T12:00:00Z',
    last_status_change: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    service_name: 'Service Alpha',
    service_team_id: 'team-1',
    service_team_name: 'Team One',
    target_service_id: null,
    association_type: null,
    avg_latency_24h: null,
    linked_service_name: null,
    ...overrides,
  };
}

describe('WallboardService', () => {
  let service: WallboardService;

  beforeEach(() => {
    mockFindAllForWallboard.mockReset();
    mockFindAllCanonicalOverrides.mockReset();
    mockFindAllCanonicalOverrides.mockReturnValue([]);
    service = new WallboardService();
  });

  it('returns empty data when no dependencies', () => {
    mockFindAllForWallboard.mockReturnValue([]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(0);
    expect(result.teams).toHaveLength(0);
  });

  it('groups dependencies by canonical name', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'PostgreSQL', canonical_name: 'postgresql', service_id: 'svc-1', service_name: 'Service Alpha' }),
      makeDep({ id: 'dep-2', name: 'postgres', canonical_name: 'postgresql', service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].reporters).toHaveLength(2);
  });

  it('groups dependencies by name when no canonical_name', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'Redis', canonical_name: null, service_id: 'svc-1' }),
      makeDep({ id: 'dep-2', name: 'redis', canonical_name: null, service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].reporters).toHaveLength(2);
  });

  it('groups dependencies linked to the same service even with different names', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({
        id: 'dep-1', name: 'sso', service_id: 'svc-1', service_name: 'Service Alpha',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Token Service',
      }),
      makeDep({
        id: 'dep-2', name: 'SSO Auth Manager', service_id: 'svc-2', service_name: 'Service Beta',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Token Service',
      }),
      makeDep({
        id: 'dep-3', name: 'SSO Authentication Service', service_id: 'svc-3', service_name: 'Service Gamma',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Token Service',
      }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].canonical_name).toBe('SSO Auth Token Service');
    expect(result.dependencies[0].reporters).toHaveLength(3);
  });

  it('keeps deps with different linked services as separate cards', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({
        id: 'dep-1', name: 'sso', service_id: 'svc-1',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Service',
      }),
      makeDep({
        id: 'dep-2', name: 'ssoADGroups', service_id: 'svc-2', service_name: 'Service Beta',
        target_service_id: 'ext-ad', linked_service_name: 'SSO AD Groups',
      }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(2);
  });

  it('uses linked service name as display name when grouped by linked service', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({
        id: 'dep-1', name: 'auth-token', last_checked: '2025-01-01T14:00:00Z',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Token Service',
      }),
      makeDep({
        id: 'dep-2', name: 'sso', service_id: 'svc-2', service_name: 'Service Beta',
        last_checked: '2025-01-01T10:00:00Z',
        target_service_id: 'ext-sso', linked_service_name: 'SSO Auth Token Service',
      }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].canonical_name).toBe('SSO Auth Token Service');
  });

  it('worst health status wins: critical > warning > healthy > unknown', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', healthy: 1, health_state: 0 }),
      makeDep({ id: 'dep-2', name: 'db', healthy: 0, health_state: 2, service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].health_status).toBe('critical');
  });

  it('warning wins over healthy', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'API', healthy: 1, health_state: 0 }),
      makeDep({ id: 'dep-2', name: 'api', healthy: 1, health_state: 1, service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].health_status).toBe('warning');
  });

  it('unknown status when healthy and health_state are null', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'API', healthy: null, health_state: null }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].health_status).toBe('unknown');
  });

  it('selects primary dependency as most recently checked', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-old', name: 'DB', last_checked: '2025-01-01T10:00:00Z' }),
      makeDep({ id: 'dep-new', name: 'db', last_checked: '2025-01-01T14:00:00Z', service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].primary_dependency_id).toBe('dep-new');
  });

  it('handles primary when one has null last_checked', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', last_checked: null }),
      makeDep({ id: 'dep-2', name: 'db', last_checked: '2025-01-01T14:00:00Z', service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].primary_dependency_id).toBe('dep-2');
  });

  it('aggregates latency as min/avg/max', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', latency_ms: 10 }),
      makeDep({ id: 'dep-2', name: 'db', latency_ms: 30, service_id: 'svc-2', service_name: 'Service Beta' }),
      makeDep({ id: 'dep-3', name: 'db', latency_ms: 50, service_id: 'svc-3', service_name: 'Service Gamma' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].latency).toEqual({ min: 10, avg: 30, max: 50 });
  });

  it('returns null latency when no reporters have latency data', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', latency_ms: null }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].latency).toBeNull();
  });

  it('resolves linked service from reporters with association', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', target_service_id: 'svc-target', linked_service_name: 'Target Service' }),
      makeDep({ id: 'dep-2', name: 'db', target_service_id: 'svc-target', linked_service_name: 'Target Service', service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].linked_service).toEqual({ id: 'svc-target', name: 'Target Service' });
  });

  it('returns null linked_service when no associations', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].linked_service).toBeNull();
  });

  it('collects unique team_ids across reporters', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', service_team_id: 'team-1' }),
      makeDep({ id: 'dep-2', name: 'db', service_team_id: 'team-2', service_id: 'svc-2', service_name: 'Service Beta', service_team_name: 'Team Two' }),
      makeDep({ id: 'dep-3', name: 'db', service_team_id: 'team-1', service_id: 'svc-3', service_name: 'Service Gamma' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].team_ids).toEqual(expect.arrayContaining(['team-1', 'team-2']));
    expect(result.dependencies[0].team_ids).toHaveLength(2);
  });

  it('filters by teamIds when provided', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', service_team_id: 'team-1' }),
      makeDep({ id: 'dep-2', name: 'Redis', service_team_id: 'team-2', service_team_name: 'Team Two' }),
    ]);

    const result = service.getWallboardData(['team-1']);

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].canonical_name).toBe('DB');
  });

  it('returns sorted teams list', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', service_team_id: 'team-b', service_team_name: 'Beta Team' }),
      makeDep({ id: 'dep-2', name: 'Redis', service_team_id: 'team-a', service_team_name: 'Alpha Team' }),
    ]);

    const result = service.getWallboardData();

    expect(result.teams[0].name).toBe('Alpha Team');
    expect(result.teams[1].name).toBe('Beta Team');
  });

  it('sorts dependencies by health status (worst first) then alphabetically', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'Alpha', healthy: 1, health_state: 0 }),
      makeDep({ id: 'dep-2', name: 'Beta', healthy: 0, health_state: 2, service_id: 'svc-2' }),
      makeDep({ id: 'dep-3', name: 'Charlie', healthy: 1, health_state: 1, service_id: 'svc-3' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies.map((d) => d.canonical_name)).toEqual(['Beta', 'Charlie', 'Alpha']);
  });

  it('uses most common type across reporters', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', type: 'database' }),
      makeDep({ id: 'dep-2', name: 'db', type: 'rest', service_id: 'svc-2', service_name: 'Service Beta' }),
      makeDep({ id: 'dep-3', name: 'db', type: 'database', service_id: 'svc-3', service_name: 'Service Gamma' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].type).toBe('database');
  });

  it('includes error_message from primary dependency', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', last_checked: '2025-01-01T14:00:00Z', error_message: 'Connection refused' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].error_message).toBe('Connection refused');
  });

  it('includes impact and description', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'DB', impact: 'Data unavailable', description: 'Main database' }),
    ]);

    const result = service.getWallboardData();

    expect(result.dependencies[0].impact).toBe('Data unavailable');
    expect(result.dependencies[0].description).toBe('Main database');
  });

  it('uses canonical_name for display when available', () => {
    mockFindAllForWallboard.mockReturnValue([
      makeDep({ id: 'dep-1', name: 'postgres_db', canonical_name: 'PostgreSQL', last_checked: '2025-01-01T14:00:00Z' }),
      makeDep({ id: 'dep-2', name: 'pg', canonical_name: 'PostgreSQL', last_checked: '2025-01-01T10:00:00Z', service_id: 'svc-2', service_name: 'Service Beta' }),
    ]);

    const result = service.getWallboardData();

    // Primary is dep-1 (most recently checked), uses its canonical_name
    expect(result.dependencies[0].canonical_name).toBe('PostgreSQL');
  });

  describe('effective_contact and effective_impact resolution', () => {
    it('returns null effective fields when no override data exists', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({ id: 'dep-1', name: 'DB', contact: null, contact_override: null, impact_override: null, impact: null }),
      ]);

      const result = service.getWallboardData();

      expect(result.dependencies[0].effective_contact).toBeNull();
      expect(result.dependencies[0].effective_impact).toBeNull();
    });

    it('uses polled contact and impact when no overrides exist', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-1',
          name: 'DB',
          contact: '{"email":"polled@example.com"}',
          impact: 'Critical database',
        }),
      ]);

      const result = service.getWallboardData();

      expect(result.dependencies[0].effective_contact).toBe('{"email":"polled@example.com"}');
      expect(result.dependencies[0].effective_impact).toBe('Critical database');
    });

    it('applies canonical override over polled data', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-1',
          name: 'DB',
          canonical_name: 'PostgreSQL',
          contact: '{"email":"polled@example.com"}',
          impact: 'Polled impact',
        }),
      ]);
      mockFindAllCanonicalOverrides.mockReturnValue([
        {
          id: 'co-1',
          canonical_name: 'PostgreSQL',
          contact_override: '{"email":"canonical@example.com","slack":"#db"}',
          impact_override: 'Canonical impact',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          updated_by: 'user-1',
        },
      ]);

      const result = service.getWallboardData();

      expect(JSON.parse(result.dependencies[0].effective_contact!)).toEqual({
        email: 'canonical@example.com',
        slack: '#db',
      });
      expect(result.dependencies[0].effective_impact).toBe('Canonical impact');
    });

    it('applies instance override over canonical override', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-1',
          name: 'DB',
          canonical_name: 'PostgreSQL',
          contact: '{"email":"polled@example.com"}',
          contact_override: '{"email":"instance@example.com","pager":"555-0100"}',
          impact: 'Polled impact',
          impact_override: 'Instance impact',
        }),
      ]);
      mockFindAllCanonicalOverrides.mockReturnValue([
        {
          id: 'co-1',
          canonical_name: 'PostgreSQL',
          contact_override: '{"email":"canonical@example.com","slack":"#db"}',
          impact_override: 'Canonical impact',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          updated_by: 'user-1',
        },
      ]);

      const result = service.getWallboardData();

      // Contact: field-level merge — instance keys win
      expect(JSON.parse(result.dependencies[0].effective_contact!)).toEqual({
        email: 'instance@example.com',
        slack: '#db',
        pager: '555-0100',
      });
      // Impact: first-non-null — instance wins
      expect(result.dependencies[0].effective_impact).toBe('Instance impact');
    });

    it('uses primary dependency for override resolution in a group', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-old',
          name: 'DB',
          last_checked: '2025-01-01T10:00:00Z',
          contact_override: '{"email":"old@example.com"}',
          impact_override: 'Old impact',
        }),
        makeDep({
          id: 'dep-new',
          name: 'db',
          service_id: 'svc-2',
          service_name: 'Service Beta',
          last_checked: '2025-01-01T14:00:00Z',
          contact_override: '{"email":"new@example.com"}',
          impact_override: 'New impact',
        }),
      ]);

      const result = service.getWallboardData();

      // dep-new is primary (most recently checked)
      expect(result.dependencies[0].effective_contact).toBe('{"email":"new@example.com"}');
      expect(result.dependencies[0].effective_impact).toBe('New impact');
    });

    it('does not apply canonical override when dep has no canonical_name', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-1',
          name: 'custom-db',
          canonical_name: null,
          contact: '{"email":"polled@example.com"}',
          impact: 'Polled impact',
        }),
      ]);
      mockFindAllCanonicalOverrides.mockReturnValue([
        {
          id: 'co-1',
          canonical_name: 'PostgreSQL',
          contact_override: '{"email":"canonical@example.com"}',
          impact_override: 'Canonical impact',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          updated_by: 'user-1',
        },
      ]);

      const result = service.getWallboardData();

      // Should use polled data only — canonical override doesn't match
      expect(result.dependencies[0].effective_contact).toBe('{"email":"polled@example.com"}');
      expect(result.dependencies[0].effective_impact).toBe('Polled impact');
    });

    it('field-level merges contact across all three tiers', () => {
      mockFindAllForWallboard.mockReturnValue([
        makeDep({
          id: 'dep-1',
          name: 'DB',
          canonical_name: 'PostgreSQL',
          contact: '{"email":"polled@example.com","oncall":"polled-team"}',
          contact_override: '{"pager":"555-0100"}',
        }),
      ]);
      mockFindAllCanonicalOverrides.mockReturnValue([
        {
          id: 'co-1',
          canonical_name: 'PostgreSQL',
          contact_override: '{"slack":"#db-canonical","oncall":"canonical-team"}',
          impact_override: null,
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          updated_by: 'user-1',
        },
      ]);

      const result = service.getWallboardData();

      // polled: email, oncall → canonical: slack, oncall (wins) → instance: pager
      expect(JSON.parse(result.dependencies[0].effective_contact!)).toEqual({
        email: 'polled@example.com',
        oncall: 'canonical-team',
        slack: '#db-canonical',
        pager: '555-0100',
      });
    });
  });
});
