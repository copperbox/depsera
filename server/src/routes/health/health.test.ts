import request from 'supertest';
import express from 'express';
import healthRouter from './index';

const app = express();
app.use('/health', healthRouter);

describe('Health API', () => {
  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
});
