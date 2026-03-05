import { validateRulesUpdate, validateMuteCreate, validateChannelCreate, validateChannelUpdate } from './validation';

describe('validateRulesUpdate', () => {
  it('validates basic rules update', () => {
    const result = validateRulesUpdate({
      severity_filter: 'critical',
      is_active: true,
    });
    expect(result.severity_filter).toBe('critical');
    expect(result.is_active).toBe(true);
  });

  it('rejects missing severity_filter', () => {
    expect(() => validateRulesUpdate({ is_active: true })).toThrow('severity_filter');
  });

  it('rejects invalid severity_filter', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'invalid',
      is_active: true,
    })).toThrow('severity_filter');
  });

  it('accepts valid cooldown_minutes', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
      cooldown_minutes: 10,
    });
    expect(result.cooldown_minutes).toBe(10);
  });

  it('accepts null cooldown_minutes', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
      cooldown_minutes: null,
    });
    expect(result.cooldown_minutes).toBeNull();
  });

  it('rejects cooldown_minutes out of range', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      cooldown_minutes: -1,
    })).toThrow('cooldown_minutes');

    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      cooldown_minutes: 1441,
    })).toThrow('cooldown_minutes');
  });

  it('accepts valid rate_limit_per_hour', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
      rate_limit_per_hour: 50,
    });
    expect(result.rate_limit_per_hour).toBe(50);
  });

  it('rejects rate_limit_per_hour out of range', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      rate_limit_per_hour: 0,
    })).toThrow('rate_limit_per_hour');

    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      rate_limit_per_hour: 1001,
    })).toThrow('rate_limit_per_hour');
  });

  // alert_delay_minutes validation
  it('accepts valid alert_delay_minutes', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 5,
    });
    expect(result.alert_delay_minutes).toBe(5);
  });

  it('accepts null alert_delay_minutes', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: null,
    });
    expect(result.alert_delay_minutes).toBeNull();
  });

  it('rejects alert_delay_minutes below 1', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 0,
    })).toThrow('alert_delay_minutes');
  });

  it('rejects alert_delay_minutes above 60', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 61,
    })).toThrow('alert_delay_minutes');
  });

  it('rejects non-integer alert_delay_minutes', () => {
    expect(() => validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 5.5,
    })).toThrow('alert_delay_minutes');
  });

  it('accepts alert_delay_minutes at boundaries', () => {
    const result1 = validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 1,
    });
    expect(result1.alert_delay_minutes).toBe(1);

    const result60 = validateRulesUpdate({
      severity_filter: 'all',
      alert_delay_minutes: 60,
    });
    expect(result60.alert_delay_minutes).toBe(60);
  });

  it('does not include alert_delay_minutes when not provided', () => {
    const result = validateRulesUpdate({
      severity_filter: 'all',
    });
    expect(result.alert_delay_minutes).toBeUndefined();
  });
});

describe('validateMuteCreate', () => {
  it('accepts dependency_id mute', () => {
    const result = validateMuteCreate({ dependency_id: 'dep-1' });
    expect(result.dependency_id).toBe('dep-1');
    expect(result.canonical_name).toBeUndefined();
  });

  it('accepts canonical_name mute', () => {
    const result = validateMuteCreate({ canonical_name: 'redis' });
    expect(result.canonical_name).toBe('redis');
    expect(result.dependency_id).toBeUndefined();
  });

  it('rejects when both dependency_id and canonical_name provided', () => {
    expect(() => validateMuteCreate({
      dependency_id: 'dep-1',
      canonical_name: 'redis',
    })).toThrow('Exactly one');
  });

  it('rejects when neither dependency_id nor canonical_name provided', () => {
    expect(() => validateMuteCreate({})).toThrow('Exactly one');
  });

  it('rejects empty string dependency_id', () => {
    expect(() => validateMuteCreate({ dependency_id: '' })).toThrow('Exactly one');
  });

  it('rejects empty string canonical_name', () => {
    expect(() => validateMuteCreate({ canonical_name: '' })).toThrow('Exactly one');
  });

  it('accepts valid duration', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', duration: '30m' });
    expect(result.duration).toBe('30m');
  });

  it('accepts duration in hours', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', duration: '2h' });
    expect(result.duration).toBe('2h');
  });

  it('accepts duration in days', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', duration: '7d' });
    expect(result.duration).toBe('7d');
  });

  it('rejects invalid duration format', () => {
    expect(() => validateMuteCreate({
      canonical_name: 'redis',
      duration: 'invalid',
    })).toThrow('duration');
  });

  it('accepts valid reason', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', reason: 'Maintenance' });
    expect(result.reason).toBe('Maintenance');
  });

  it('rejects reason longer than 500 characters', () => {
    expect(() => validateMuteCreate({
      canonical_name: 'redis',
      reason: 'x'.repeat(501),
    })).toThrow('reason');
  });

  it('omits empty duration', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', duration: '' });
    expect(result.duration).toBeUndefined();
  });

  it('omits empty reason', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', reason: '' });
    expect(result.reason).toBeUndefined();
  });

  it('omits null duration', () => {
    const result = validateMuteCreate({ canonical_name: 'redis', duration: null });
    expect(result.duration).toBeUndefined();
  });
});

describe('validateChannelCreate', () => {
  it('validates slack channel', () => {
    const result = validateChannelCreate({
      channel_type: 'slack',
      config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' },
    });
    expect(result.channel_type).toBe('slack');
  });

  it('rejects invalid channel_type', () => {
    expect(() => validateChannelCreate({
      channel_type: 'invalid',
      config: {},
    })).toThrow('channel_type');
  });

  it('rejects missing config', () => {
    expect(() => validateChannelCreate({
      channel_type: 'slack',
    })).toThrow('config');
  });
});

describe('validateChannelUpdate', () => {
  it('validates is_active update', () => {
    const result = validateChannelUpdate({ is_active: false });
    expect(result.is_active).toBe(false);
  });

  it('rejects empty update', () => {
    expect(() => validateChannelUpdate({})).toThrow('At least one field');
  });
});
