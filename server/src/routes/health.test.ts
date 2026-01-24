import { db } from '../db';

describe('Health Check', () => {
  it('should have a working database connection', () => {
    const result = db.prepare('SELECT 1 as ok').get() as { ok: number };
    expect(result.ok).toBe(1);
  });
});
