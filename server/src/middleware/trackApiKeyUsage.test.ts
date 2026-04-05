import express from 'express';
import request from 'supertest';
import { createTrackApiKeyUsage, incrementRejected, _flush, _accumulator } from './trackApiKeyUsage';

// Mock the stores module
const mockBulkUpsert = jest.fn();
jest.mock('../stores', () => ({
  getStores: () => ({
    apiKeyUsage: {
      bulkUpsert: mockBulkUpsert,
    },
  }),
}));

function createApp() {
  const app = express();
  app.use(express.json());

  // Inject apiKeyId
  app.use((req, _res, next) => {
    req.apiKeyId = 'key-1';
    next();
  });

  app.use(createTrackApiKeyUsage());

  app.post('/v1/metrics', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('trackApiKeyUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the accumulator before each test
    _accumulator.clear();
  });

  describe('accumulator increment (DPS-100h)', () => {
    it('should increment count in accumulator for both minute and hour granularities', async () => {
      const app = createApp();

      await request(app).post('/v1/metrics').send({});

      // Should have two entries: one minute, one hour
      expect(_accumulator.size).toBe(2);

      const entries = Array.from(_accumulator.entries());
      const granularities = entries.map(([key]) => key.split('|')[1]);
      expect(granularities).toContain('minute');
      expect(granularities).toContain('hour');

      // Both should have count = 1, rejected = 0
      for (const [, val] of entries) {
        expect(val.count).toBe(1);
        expect(val.rejected).toBe(0);
      }
    });

    it('should accumulate multiple requests for the same bucket', async () => {
      const app = createApp();

      await request(app).post('/v1/metrics').send({});
      await request(app).post('/v1/metrics').send({});
      await request(app).post('/v1/metrics').send({});

      // Still 2 entries (minute + hour), but counts incremented
      expect(_accumulator.size).toBe(2);

      for (const [, val] of _accumulator) {
        expect(val.count).toBe(3);
        expect(val.rejected).toBe(0);
      }
    });
  });

  describe('flush (DPS-100h)', () => {
    it('should call bulkUpsert with correct entries after flush', async () => {
      const app = createApp();

      await request(app).post('/v1/metrics').send({});
      await request(app).post('/v1/metrics').send({});

      _flush();

      expect(mockBulkUpsert).toHaveBeenCalledTimes(1);

      const entries = mockBulkUpsert.mock.calls[0][0];
      expect(entries).toHaveLength(2); // minute + hour

      for (const entry of entries) {
        expect(entry.api_key_id).toBe('key-1');
        expect(entry.push_count).toBe(2);
        expect(entry.rejected_count).toBe(0);
        expect(['minute', 'hour']).toContain(entry.granularity);
        expect(entry.bucket_start).toBeDefined();
      }
    });

    it('should clear the accumulator after flush', async () => {
      const app = createApp();

      await request(app).post('/v1/metrics').send({});
      expect(_accumulator.size).toBe(2);

      _flush();

      expect(_accumulator.size).toBe(0);
    });

    it('should not call bulkUpsert when accumulator is empty', () => {
      expect(_accumulator.size).toBe(0);

      _flush();

      expect(mockBulkUpsert).not.toHaveBeenCalled();
    });
  });

  describe('incrementRejected (DPS-100i)', () => {
    it('should increment rejected count for both minute and hour granularities', () => {
      incrementRejected('key-1');

      expect(_accumulator.size).toBe(2);

      for (const [, val] of _accumulator) {
        expect(val.rejected).toBe(1);
        expect(val.count).toBe(0);
      }
    });

    it('should not affect push count when incrementing rejected', () => {
      incrementRejected('key-1');
      incrementRejected('key-1');

      for (const [, val] of _accumulator) {
        expect(val.rejected).toBe(2);
        expect(val.count).toBe(0);
      }
    });

    it('should track separate keys independently', () => {
      incrementRejected('key-1');
      incrementRejected('key-2');

      // 4 entries: minute + hour for key-1, minute + hour for key-2
      expect(_accumulator.size).toBe(4);

      const key1Entries = Array.from(_accumulator.entries()).filter(([k]) => k.startsWith('key-1'));
      const key2Entries = Array.from(_accumulator.entries()).filter(([k]) => k.startsWith('key-2'));

      expect(key1Entries).toHaveLength(2);
      expect(key2Entries).toHaveLength(2);
    });

    it('should flush rejected counts correctly via bulkUpsert', () => {
      incrementRejected('key-1');
      incrementRejected('key-1');

      _flush();

      expect(mockBulkUpsert).toHaveBeenCalledTimes(1);
      const entries = mockBulkUpsert.mock.calls[0][0];

      for (const entry of entries) {
        expect(entry.api_key_id).toBe('key-1');
        expect(entry.push_count).toBe(0);
        expect(entry.rejected_count).toBe(2);
      }
    });
  });
});
