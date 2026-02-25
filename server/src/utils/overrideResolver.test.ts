import { resolveContact, resolveImpact } from './overrideResolver';

describe('resolveContact', () => {
  it('returns null when all inputs are null', () => {
    expect(resolveContact(null, null, null)).toBeNull();
  });

  it('returns null when all inputs are undefined', () => {
    expect(resolveContact(undefined, undefined, undefined)).toBeNull();
  });

  it('returns polled contact when no overrides exist', () => {
    const polled = JSON.stringify({ email: 'team@example.com', slack: '#general' });
    const result = resolveContact(polled, null, null);
    expect(JSON.parse(result!)).toEqual({ email: 'team@example.com', slack: '#general' });
  });

  it('returns canonical override when only canonical exists', () => {
    const canonical = JSON.stringify({ email: 'canonical@example.com' });
    const result = resolveContact(null, canonical, null);
    expect(JSON.parse(result!)).toEqual({ email: 'canonical@example.com' });
  });

  it('returns instance override when only instance exists', () => {
    const instance = JSON.stringify({ phone: '555-1234' });
    const result = resolveContact(null, null, instance);
    expect(JSON.parse(result!)).toEqual({ phone: '555-1234' });
  });

  it('merges canonical override on top of polled (canonical keys win)', () => {
    const polled = JSON.stringify({ email: 'polled@example.com', slack: '#polled' });
    const canonical = JSON.stringify({ email: 'canonical@example.com' });
    const result = resolveContact(polled, canonical, null);
    expect(JSON.parse(result!)).toEqual({
      email: 'canonical@example.com',
      slack: '#polled',
    });
  });

  it('merges instance override on top of polled (instance keys win)', () => {
    const polled = JSON.stringify({ email: 'polled@example.com', slack: '#polled' });
    const instance = JSON.stringify({ email: 'instance@example.com' });
    const result = resolveContact(polled, null, instance);
    expect(JSON.parse(result!)).toEqual({
      email: 'instance@example.com',
      slack: '#polled',
    });
  });

  it('merges all three tiers with correct precedence (instance > canonical > polled)', () => {
    const polled = JSON.stringify({ email: 'polled@example.com', slack: '#polled', pager: '911' });
    const canonical = JSON.stringify({ email: 'canonical@example.com', oncall: 'Team A' });
    const instance = JSON.stringify({ email: 'instance@example.com' });
    const result = resolveContact(polled, canonical, instance);
    expect(JSON.parse(result!)).toEqual({
      email: 'instance@example.com',
      slack: '#polled',
      pager: '911',
      oncall: 'Team A',
    });
  });

  it('handles partial overlap between canonical and instance', () => {
    const canonical = JSON.stringify({ email: 'canonical@example.com', slack: '#canonical' });
    const instance = JSON.stringify({ slack: '#instance', phone: '555-0000' });
    const result = resolveContact(null, canonical, instance);
    expect(JSON.parse(result!)).toEqual({
      email: 'canonical@example.com',
      slack: '#instance',
      phone: '555-0000',
    });
  });

  it('ignores invalid JSON strings gracefully', () => {
    const result = resolveContact('not-json', null, null);
    expect(result).toBeNull();
  });

  it('ignores non-object JSON (array)', () => {
    const result = resolveContact('["a","b"]', null, null);
    expect(result).toBeNull();
  });

  it('ignores non-object JSON (string)', () => {
    const result = resolveContact('"hello"', null, null);
    expect(result).toBeNull();
  });

  it('ignores non-object JSON (number)', () => {
    const result = resolveContact('42', null, null);
    expect(result).toBeNull();
  });

  it('handles empty string as null', () => {
    const result = resolveContact('', null, null);
    expect(result).toBeNull();
  });

  it('skips invalid canonical override but still uses valid polled', () => {
    const polled = JSON.stringify({ email: 'polled@example.com' });
    const result = resolveContact(polled, 'bad-json', null);
    expect(JSON.parse(result!)).toEqual({ email: 'polled@example.com' });
  });

  it('skips invalid instance override but uses valid canonical and polled', () => {
    const polled = JSON.stringify({ email: 'polled@example.com' });
    const canonical = JSON.stringify({ slack: '#canonical' });
    const result = resolveContact(polled, canonical, '{{bad');
    expect(JSON.parse(result!)).toEqual({
      email: 'polled@example.com',
      slack: '#canonical',
    });
  });
});

describe('resolveImpact', () => {
  it('returns null when all inputs are null', () => {
    expect(resolveImpact(null, null, null)).toBeNull();
  });

  it('returns null when all inputs are undefined', () => {
    expect(resolveImpact(undefined, undefined, undefined)).toBeNull();
  });

  it('returns polled impact when no overrides exist', () => {
    expect(resolveImpact('High', null, null)).toBe('High');
  });

  it('returns canonical override when only canonical exists', () => {
    expect(resolveImpact(null, 'Medium', null)).toBe('Medium');
  });

  it('returns instance override when only instance exists', () => {
    expect(resolveImpact(null, null, 'Low')).toBe('Low');
  });

  it('instance override takes precedence over canonical and polled', () => {
    expect(resolveImpact('High', 'Medium', 'Low')).toBe('Low');
  });

  it('canonical override takes precedence over polled', () => {
    expect(resolveImpact('High', 'Medium', null)).toBe('Medium');
  });

  it('canonical override takes precedence over polled when instance is undefined', () => {
    expect(resolveImpact('High', 'Medium', undefined)).toBe('Medium');
  });

  it('returns polled when overrides are null', () => {
    expect(resolveImpact('Critical', null, null)).toBe('Critical');
  });

  it('returns empty string instance override (empty string is non-null)', () => {
    expect(resolveImpact('High', 'Medium', '')).toBe('');
  });

  it('returns empty string canonical override', () => {
    expect(resolveImpact('High', '', null)).toBe('');
  });
});
