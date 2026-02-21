import Database from 'better-sqlite3';
import { UserStore } from './UserStore';
import { InvalidOrderByError } from '../orderByValidator';

describe('UserStore', () => {
  let db: Database.Database;
  let store: UserStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    store = new UserStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create user with required fields', () => {
      const user = store.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('user');
      expect(user.is_active).toBe(1);
    });

    it('should create user with oidc_subject', () => {
      const user = store.create({
        email: 'test@example.com',
        name: 'Test User',
        oidc_subject: 'oidc-123',
      });

      expect(user.oidc_subject).toBe('oidc-123');
    });

    it('should create admin user', () => {
      const user = store.create({
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      });

      expect(user.role).toBe('admin');
    });
  });

  describe('findById', () => {
    it('should find existing user', () => {
      const created = store.create({ email: 'test@example.com', name: 'Test' });
      const found = store.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    it('should return undefined for non-existent user', () => {
      const found = store.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', () => {
      store.create({ email: 'test@example.com', name: 'Test' });
      const found = store.findByEmail('test@example.com');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Test');
    });

    it('should return undefined for non-existent email', () => {
      const found = store.findByEmail('nonexistent@example.com');
      expect(found).toBeUndefined();
    });
  });

  describe('findByOidcSubject', () => {
    it('should find user by OIDC subject', () => {
      store.create({
        email: 'test@example.com',
        name: 'Test',
        oidc_subject: 'oidc-123',
      });
      const found = store.findByOidcSubject('oidc-123');

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    it('should return undefined for non-existent subject', () => {
      const found = store.findByOidcSubject('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all users', () => {
      store.create({ email: 'a@example.com', name: 'User A' });
      store.create({ email: 'b@example.com', name: 'User B' });

      const users = store.findAll();

      expect(users).toHaveLength(2);
    });

    it('should respect limit and offset', () => {
      store.create({ email: 'a@example.com', name: 'User A' });
      store.create({ email: 'b@example.com', name: 'User B' });
      store.create({ email: 'c@example.com', name: 'User C' });

      const users = store.findAll({ limit: 2, offset: 1 });

      expect(users).toHaveLength(2);
    });

    it('should respect orderBy and orderDirection', () => {
      store.create({ email: 'z@example.com', name: 'Zack' });
      store.create({ email: 'a@example.com', name: 'Alice' });

      const users = store.findAll({ orderBy: 'name', orderDirection: 'ASC' });

      expect(users[0].name).toBe('Alice');
    });

    it('should accept other valid orderBy columns', () => {
      store.create({ email: 'a@example.com', name: 'Alice' });
      const users = store.findAll({ orderBy: 'email', orderDirection: 'DESC' });
      expect(users).toHaveLength(1);
    });

    it('should throw InvalidOrderByError for non-whitelisted column', () => {
      expect(() => store.findAll({ orderBy: 'password_hash' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for SQL injection via orderBy', () => {
      expect(() => store.findAll({ orderBy: 'name; DROP TABLE users; --' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for invalid orderDirection', () => {
      expect(() => store.findAll({ orderBy: 'name', orderDirection: 'INVALID' as 'ASC' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError in findActive for non-whitelisted column', () => {
      expect(() => store.findActive({ orderBy: 'oidc_subject' }))
        .toThrow(InvalidOrderByError);
    });
  });

  describe('findActive', () => {
    it('should return only active users', () => {
      const user1 = store.create({ email: 'a@example.com', name: 'Active' });
      const user2 = store.create({ email: 'b@example.com', name: 'Inactive' });
      store.update(user2.id, { is_active: false });

      const users = store.findActive();

      expect(users).toHaveLength(1);
      expect(users[0].id).toBe(user1.id);
    });

    it('should respect limit and offset for active users', () => {
      store.create({ email: 'a@example.com', name: 'User A' });
      store.create({ email: 'b@example.com', name: 'User B' });

      const users = store.findActive({ limit: 1 });

      expect(users).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update user fields', () => {
      const user = store.create({ email: 'old@example.com', name: 'Old Name' });

      const updated = store.update(user.id, {
        email: 'new@example.com',
        name: 'New Name',
      });

      expect(updated?.email).toBe('new@example.com');
      expect(updated?.name).toBe('New Name');
    });

    it('should update role', () => {
      const user = store.create({ email: 'test@example.com', name: 'Test' });

      const updated = store.update(user.id, { role: 'admin' });

      expect(updated?.role).toBe('admin');
    });

    it('should deactivate user', () => {
      const user = store.create({ email: 'test@example.com', name: 'Test' });

      const updated = store.update(user.id, { is_active: false });

      expect(updated?.is_active).toBe(0);
    });

    it('should return existing user when no updates', () => {
      const user = store.create({ email: 'test@example.com', name: 'Test' });

      const updated = store.update(user.id, {});

      expect(updated?.email).toBe('test@example.com');
    });

    it('should return undefined for non-existent user', () => {
      const updated = store.update('non-existent', { name: 'New' });
      expect(updated).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete user', () => {
      const user = store.create({ email: 'test@example.com', name: 'Test' });

      const deleted = store.delete(user.id);

      expect(deleted).toBe(true);
      expect(store.findById(user.id)).toBeUndefined();
    });

    it('should return false for non-existent user', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing user', () => {
      const user = store.create({ email: 'test@example.com', name: 'Test' });
      expect(store.exists(user.id)).toBe(true);
    });

    it('should return false for non-existent user', () => {
      expect(store.exists('non-existent')).toBe(false);
    });
  });

  describe('existsByEmail', () => {
    it('should return true for existing email', () => {
      store.create({ email: 'test@example.com', name: 'Test' });
      expect(store.existsByEmail('test@example.com')).toBe(true);
    });

    it('should return false for non-existent email', () => {
      expect(store.existsByEmail('nonexistent@example.com')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return total user count', () => {
      store.create({ email: 'a@example.com', name: 'A' });
      store.create({ email: 'b@example.com', name: 'B' });

      expect(store.count()).toBe(2);
    });
  });

  describe('countActiveAdmins', () => {
    it('should count active admins only', () => {
      store.create({ email: 'admin@example.com', name: 'Admin', role: 'admin' });
      store.create({ email: 'user@example.com', name: 'User', role: 'user' });
      const inactiveAdmin = store.create({
        email: 'inactive@example.com',
        name: 'Inactive',
        role: 'admin',
      });
      store.update(inactiveAdmin.id, { is_active: false });

      expect(store.countActiveAdmins()).toBe(1);
    });
  });
});
