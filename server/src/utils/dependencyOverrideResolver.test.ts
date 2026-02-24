import { Dependency, DependencyCanonicalOverride } from '../db/types';
import { resolveDependencyOverridesWithCanonical } from './dependencyOverrideResolver';

function makeDependency(overrides: Partial<Dependency> = {}): Dependency {
  return {
    id: 'dep-1',
    service_id: 'svc-1',
    name: 'test-dep',
    canonical_name: null,
    description: null,
    impact: null,
    type: 'database',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 10,
    contact: null,
    contact_override: null,
    impact_override: null,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: '2026-01-01T00:00:00.000Z',
    last_status_change: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCanonicalOverride(
  overrides: Partial<DependencyCanonicalOverride> = {},
): DependencyCanonicalOverride {
  return {
    id: 'co-1',
    canonical_name: 'PostgreSQL',
    contact_override: null,
    impact_override: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by: null,
    ...overrides,
  };
}

describe('resolveDependencyOverridesWithCanonical', () => {
  it('returns empty array for empty input', () => {
    const result = resolveDependencyOverridesWithCanonical([], []);
    expect(result).toEqual([]);
  });

  it('returns null effective fields when no overrides or polled data exist', () => {
    const deps = [makeDependency()];
    const result = resolveDependencyOverridesWithCanonical(deps, []);

    expect(result).toHaveLength(1);
    expect(result[0].effective_contact).toBeNull();
    expect(result[0].effective_impact).toBeNull();
  });

  it('uses polled contact and impact when no overrides exist', () => {
    const deps = [makeDependency({
      contact: JSON.stringify({ email: 'polled@example.com' }),
      impact: 'low',
    })];
    const result = resolveDependencyOverridesWithCanonical(deps, []);

    expect(JSON.parse(result[0].effective_contact!)).toEqual({ email: 'polled@example.com' });
    expect(result[0].effective_impact).toBe('low');
  });

  it('applies canonical override when dependency has matching canonical_name', () => {
    const deps = [makeDependency({
      canonical_name: 'PostgreSQL',
      contact: JSON.stringify({ email: 'polled@example.com' }),
      impact: 'low',
    })];
    const canonicals = [makeCanonicalOverride({
      contact_override: JSON.stringify({ email: 'canonical@example.com', slack: '#db' }),
      impact_override: 'critical',
    })];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    // Canonical email overrides polled email; canonical slack is added
    expect(JSON.parse(result[0].effective_contact!)).toEqual({
      email: 'canonical@example.com',
      slack: '#db',
    });
    // Canonical impact wins over polled
    expect(result[0].effective_impact).toBe('critical');
  });

  it('applies instance override over canonical and polled', () => {
    const deps = [makeDependency({
      canonical_name: 'PostgreSQL',
      contact: JSON.stringify({ email: 'polled@example.com' }),
      contact_override: JSON.stringify({ email: 'instance@example.com' }),
      impact: 'low',
      impact_override: 'high',
    })];
    const canonicals = [makeCanonicalOverride({
      contact_override: JSON.stringify({ email: 'canonical@example.com' }),
      impact_override: 'critical',
    })];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    // Instance email wins over canonical
    expect(JSON.parse(result[0].effective_contact!)).toEqual({ email: 'instance@example.com' });
    // Instance impact wins over canonical
    expect(result[0].effective_impact).toBe('high');
  });

  it('field-level merge across all three tiers', () => {
    const deps = [makeDependency({
      canonical_name: 'PostgreSQL',
      contact: JSON.stringify({ email: 'polled@example.com', oncall: 'team-a' }),
      contact_override: JSON.stringify({ phone: '555-1234' }),
      impact: 'low',
    })];
    const canonicals = [makeCanonicalOverride({
      contact_override: JSON.stringify({ slack: '#db-support' }),
    })];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    // All three tiers merge: polled email+oncall, canonical slack, instance phone
    expect(JSON.parse(result[0].effective_contact!)).toEqual({
      email: 'polled@example.com',
      oncall: 'team-a',
      slack: '#db-support',
      phone: '555-1234',
    });
    // No impact override, falls through to polled
    expect(result[0].effective_impact).toBe('low');
  });

  it('skips canonical override when dependency has no canonical_name', () => {
    const deps = [makeDependency({
      canonical_name: null,
      contact: JSON.stringify({ email: 'polled@example.com' }),
      impact: 'low',
    })];
    const canonicals = [makeCanonicalOverride({
      contact_override: JSON.stringify({ email: 'canonical@example.com' }),
      impact_override: 'critical',
    })];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    // Canonical override not applied because no canonical_name on dependency
    expect(JSON.parse(result[0].effective_contact!)).toEqual({ email: 'polled@example.com' });
    expect(result[0].effective_impact).toBe('low');
  });

  it('skips canonical override when no matching canonical_name exists', () => {
    const deps = [makeDependency({
      canonical_name: 'Redis',
      impact: 'low',
    })];
    const canonicals = [makeCanonicalOverride({
      canonical_name: 'PostgreSQL',
      impact_override: 'critical',
    })];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    expect(result[0].effective_impact).toBe('low');
  });

  it('handles multiple dependencies with different canonical names', () => {
    const deps = [
      makeDependency({
        id: 'dep-1',
        name: 'postgres-main',
        canonical_name: 'PostgreSQL',
        impact: 'low',
      }),
      makeDependency({
        id: 'dep-2',
        name: 'redis-cache',
        canonical_name: 'Redis',
        impact: 'medium',
      }),
      makeDependency({
        id: 'dep-3',
        name: 'external-api',
        canonical_name: null,
        impact: 'none',
      }),
    ];
    const canonicals = [
      makeCanonicalOverride({
        id: 'co-1',
        canonical_name: 'PostgreSQL',
        impact_override: 'critical',
      }),
      makeCanonicalOverride({
        id: 'co-2',
        canonical_name: 'Redis',
        impact_override: 'high',
      }),
    ];

    const result = resolveDependencyOverridesWithCanonical(deps, canonicals);

    expect(result[0].effective_impact).toBe('critical');
    expect(result[1].effective_impact).toBe('high');
    expect(result[2].effective_impact).toBe('none');
  });

  it('preserves all original dependency fields', () => {
    const dep = makeDependency({
      id: 'dep-preserve',
      name: 'my-dep',
      type: 'cache',
      healthy: 0,
      latency_ms: 42,
    });

    const result = resolveDependencyOverridesWithCanonical([dep], []);

    expect(result[0].id).toBe('dep-preserve');
    expect(result[0].name).toBe('my-dep');
    expect(result[0].type).toBe('cache');
    expect(result[0].healthy).toBe(0);
    expect(result[0].latency_ms).toBe(42);
    expect(result[0]).toHaveProperty('effective_contact');
    expect(result[0]).toHaveProperty('effective_impact');
  });
});
