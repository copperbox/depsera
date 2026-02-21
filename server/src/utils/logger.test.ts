import { parseLogLevel, createLogger, type LogLevel } from './logger';

describe('parseLogLevel', () => {
  it('should return "info" when env value is undefined', () => {
    expect(parseLogLevel(undefined)).toBe('info');
  });

  it('should return "info" when env value is empty string', () => {
    expect(parseLogLevel('')).toBe('info');
  });

  it.each<[string, LogLevel]>([
    ['fatal', 'fatal'],
    ['error', 'error'],
    ['warn', 'warn'],
    ['info', 'info'],
    ['debug', 'debug'],
    ['trace', 'trace'],
    ['silent', 'silent'],
  ])('should return "%s" for input "%s"', (input, expected) => {
    expect(parseLogLevel(input)).toBe(expected);
  });

  it('should be case-insensitive', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel('Warn')).toBe('warn');
    expect(parseLogLevel('INFO')).toBe('info');
  });

  it('should trim whitespace', () => {
    expect(parseLogLevel('  debug  ')).toBe('debug');
  });

  it('should return "info" for invalid values', () => {
    expect(parseLogLevel('verbose')).toBe('info');
    expect(parseLogLevel('none')).toBe('info');
    expect(parseLogLevel('critical')).toBe('info');
  });
});

describe('createLogger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create a logger with default info level', () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger({ pretty: false });
    expect(log.level).toBe('info');
  });

  it('should respect the level option', () => {
    const log = createLogger({ level: 'debug', pretty: false });
    expect(log.level).toBe('debug');
  });

  it('should read LOG_LEVEL from env when level option is not provided', () => {
    process.env.LOG_LEVEL = 'warn';
    const log = createLogger({ pretty: false });
    expect(log.level).toBe('warn');
  });

  it('should prefer option over env var', () => {
    process.env.LOG_LEVEL = 'warn';
    const log = createLogger({ level: 'error', pretty: false });
    expect(log.level).toBe('error');
  });

  it('should create a logger that can log messages', () => {
    const log = createLogger({ level: 'silent', pretty: false });
    expect(() => log.info('test message')).not.toThrow();
    expect(() => log.error({ err: new Error('test') }, 'error occurred')).not.toThrow();
  });
});
