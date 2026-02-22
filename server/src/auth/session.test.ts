import Database from 'better-sqlite3';
import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';

const BetterSqlite3Store = SqliteStore(session);

describe('SQLite Session Store', () => {
  let testDb: Database.Database;
  let store: InstanceType<typeof BetterSqlite3Store>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    store = new BetterSqlite3Store({
      client: testDb,
      expired: {
        clear: true,
        intervalMs: 900000,
      },
    });
  });

  afterAll(() => {
    testDb.close();
  });

  it('should create the sessions table automatically', () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'sessions'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should persist and retrieve a session', (done) => {
    const sessionData = { cookie: { maxAge: 86400000 }, userId: 'user-1' };

    store.set('test-sid', sessionData as any, (err?: Error | null) => {
      expect(err).toBeFalsy();

      store.get('test-sid', (err?: Error | null, sess?: any) => {
        expect(err).toBeFalsy();
        expect(sess).toBeDefined();
        expect(sess.userId).toBe('user-1');
        done();
      });
    });
  });

  it('should destroy a session', (done) => {
    // First create a session
    const sessionData = { cookie: { maxAge: 86400000 }, userId: 'user-2' };

    store.set('destroy-sid', sessionData as any, (err?: Error | null) => {
      expect(err).toBeFalsy();

      store.destroy('destroy-sid', (err?: Error | null) => {
        expect(err).toBeFalsy();

        store.get('destroy-sid', (err?: Error | null, sess?: any) => {
          expect(err).toBeFalsy();
          expect(sess).toBeNull();
          done();
        });
      });
    });
  });

  it('should handle retrieving a non-existent session', (done) => {
    store.get('non-existent', (err?: Error | null, sess?: any) => {
      expect(err).toBeFalsy();
      expect(sess).toBeNull();
      done();
    });
  });
});
