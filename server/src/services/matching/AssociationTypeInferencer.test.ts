import {
  inferAssociationType,
  isDatabase,
  isCache,
  isMessageQueue,
  isApiCall,
} from './AssociationTypeInferencer';

describe('inferAssociationType', () => {
  describe('database detection', () => {
    it('should detect database keywords', () => {
      expect(inferAssociationType('user-db')).toBe('database');
      expect(inferAssociationType('postgres-primary')).toBe('database');
      expect(inferAssociationType('mysql-replica')).toBe('database');
      expect(inferAssociationType('mongodb-cluster')).toBe('database');
      expect(inferAssociationType('user-database')).toBe('database');
      expect(inferAssociationType('sqlite-local')).toBe('database');
    });

    it('should be case insensitive', () => {
      expect(inferAssociationType('PostgreSQL')).toBe('database');
      expect(inferAssociationType('MYSQL')).toBe('database');
    });
  });

  describe('cache detection', () => {
    it('should detect cache keywords', () => {
      expect(inferAssociationType('session-cache')).toBe('cache');
      expect(inferAssociationType('memcached-server')).toBe('cache');
      expect(inferAssociationType('elasticache-node')).toBe('cache');
    });

    it('should handle redis as cache context', () => {
      // Note: redis is in both database and cache lists,
      // but database is checked first
      expect(inferAssociationType('redis-cache')).toBe('database');
    });
  });

  describe('message queue detection', () => {
    it('should detect message queue keywords', () => {
      expect(inferAssociationType('order-queue')).toBe('message_queue');
      expect(inferAssociationType('kafka-events')).toBe('message_queue');
      expect(inferAssociationType('rabbitmq-broker')).toBe('message_queue');
      expect(inferAssociationType('sqs-notifications')).toBe('message_queue');
      expect(inferAssociationType('pubsub-topic')).toBe('message_queue');
      expect(inferAssociationType('sns-alerts')).toBe('message_queue');
    });
  });

  describe('API detection', () => {
    it('should detect API keywords', () => {
      expect(inferAssociationType('user-api')).toBe('api_call');
      expect(inferAssociationType('payment-service')).toBe('api_call');
      expect(inferAssociationType('http-gateway')).toBe('api_call');
      expect(inferAssociationType('rest-api')).toBe('api_call');
      expect(inferAssociationType('grpc-server')).toBe('api_call');
      expect(inferAssociationType('graphql-endpoint')).toBe('api_call');
    });
  });

  describe('other/unknown', () => {
    it('should return other for unknown names', () => {
      expect(inferAssociationType('some-dependency')).toBe('other');
      expect(inferAssociationType('external-thing')).toBe('other');
      expect(inferAssociationType('unknown')).toBe('other');
    });
  });
});

describe('helper functions', () => {
  describe('isDatabase', () => {
    it('should return true for database names', () => {
      expect(isDatabase('postgres-db')).toBe(true);
      expect(isDatabase('user-api')).toBe(false);
    });
  });

  describe('isCache', () => {
    it('should return true for cache names', () => {
      expect(isCache('session-cache')).toBe(true);
      expect(isCache('postgres-db')).toBe(false);
    });
  });

  describe('isMessageQueue', () => {
    it('should return true for queue names', () => {
      expect(isMessageQueue('order-queue')).toBe(true);
      expect(isMessageQueue('user-api')).toBe(false);
    });
  });

  describe('isApiCall', () => {
    it('should return true for API names', () => {
      expect(isApiCall('user-api')).toBe(true);
      expect(isApiCall('postgres-db')).toBe(false);
    });
  });
});
