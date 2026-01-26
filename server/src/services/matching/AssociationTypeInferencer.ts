import { AssociationType } from '../../db/types';

/**
 * Database-related keywords
 */
const DATABASE_KEYWORDS = [
  'db',
  'database',
  'postgres',
  'mysql',
  'mongo',
  'redis',
  'sqlite',
  'sql',
  'dynamodb',
  'cassandra',
  'oracle',
];

/**
 * Cache-related keywords
 */
const CACHE_KEYWORDS = [
  'cache',
  'redis',
  'memcache',
  'memcached',
  'elasticache',
];

/**
 * Message queue-related keywords
 */
const MESSAGE_QUEUE_KEYWORDS = [
  'queue',
  'kafka',
  'rabbit',
  'rabbitmq',
  'sqs',
  'pubsub',
  'message',
  'mq',
  'amqp',
  'eventbus',
  'sns',
];

/**
 * API-related keywords
 */
const API_KEYWORDS = [
  'api',
  'service',
  'http',
  'rest',
  'grpc',
  'graphql',
  'endpoint',
];

/**
 * Infers the association type from a dependency name based on keyword matching.
 * @param name - The dependency name to analyze
 * @returns The inferred association type
 */
export function inferAssociationType(name: string): AssociationType {
  const lower = name.toLowerCase();

  // Check database indicators
  if (DATABASE_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'database';
  }

  // Check cache indicators (note: redis can be both cache and database)
  if (CACHE_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'cache';
  }

  // Check message queue indicators
  if (MESSAGE_QUEUE_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'message_queue';
  }

  // Check API indicators
  if (API_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'api_call';
  }

  return 'other';
}

/**
 * Check if a name suggests a database dependency
 */
export function isDatabase(name: string): boolean {
  return inferAssociationType(name) === 'database';
}

/**
 * Check if a name suggests a cache dependency
 */
export function isCache(name: string): boolean {
  return inferAssociationType(name) === 'cache';
}

/**
 * Check if a name suggests a message queue dependency
 */
export function isMessageQueue(name: string): boolean {
  return inferAssociationType(name) === 'message_queue';
}

/**
 * Check if a name suggests an API call dependency
 */
export function isApiCall(name: string): boolean {
  return inferAssociationType(name) === 'api_call';
}
