import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent',
]);

export function parseLogLevel(envValue: string | undefined): LogLevel {
  if (!envValue) return 'info';
  const normalized = envValue.toLowerCase().trim();
  if (VALID_LOG_LEVELS.has(normalized)) return normalized as LogLevel;
  return 'info';
}

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = options.level ?? parseLogLevel(process.env.LOG_LEVEL);
  const pretty = options.pretty ?? isDev;

  const transport = pretty
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
    : undefined;

  return pino({ level, transport });
}

const logger = createLogger();

export default logger;
