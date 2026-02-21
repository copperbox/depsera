import Database from 'better-sqlite3';
import { TeamStore } from './TeamStore';

describe('TeamStore', () => {
  let db: Database.Database;
  let store: TeamStore;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id)
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO users (id, oidc_subject, email, name) VALUES
        ('user-1', 'oidc-1', 'user1@example.com', 'User One'),
        ('user-2', 'oidc-2', 'user2@example.com', 'User Two'),
        ('user-3', 'oidc-3', 'user3@example.com', 'User Three');
    `);

    store = new TeamStore(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM services');
    db.exec('DELETE FROM team_members');
    db.exec('DELETE FROM teams');
  });

  describe('create and findById', () => {
    it('should create team with name only', () => {
      const team = store.create({ name: 'Test Team' });

      expect(team.name).toBe('Test Team');
      expect(team.description).toBeNull();
    });

    it('should create team with description', () => {
      const team = store.create({ name: 'Test Team', description: 'A test team' });

      expect(team.name).toBe('Test Team');
      expect(team.description).toBe('A test team');
    });

    it('should find team by id', () => {
      const created = store.create({ name: 'Find Me' });
      const found = store.findById(created.id);

      expect(found?.name).toBe('Find Me');
    });

    it('should return undefined for non-existent id', () => {
      const found = store.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByName', () => {
    it('should find team by name', () => {
      store.create({ name: 'Unique Name' });
      const found = store.findByName('Unique Name');

      expect(found?.name).toBe('Unique Name');
    });

    it('should return undefined for non-existent name', () => {
      const found = store.findByName('Non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all teams ordered by name', () => {
      store.create({ name: 'Zebra Team' });
      store.create({ name: 'Alpha Team' });
      store.create({ name: 'Beta Team' });

      const teams = store.findAll();

      expect(teams).toHaveLength(3);
      expect(teams[0].name).toBe('Alpha Team');
      expect(teams[1].name).toBe('Beta Team');
      expect(teams[2].name).toBe('Zebra Team');
    });
  });

  describe('update', () => {
    it('should update name', () => {
      const team = store.create({ name: 'Original' });
      const updated = store.update(team.id, { name: 'Updated' });

      expect(updated?.name).toBe('Updated');
    });

    it('should update description', () => {
      const team = store.create({ name: 'Test', description: 'Old desc' });
      const updated = store.update(team.id, { description: 'New desc' });

      expect(updated?.description).toBe('New desc');
    });

    it('should return existing if no updates provided', () => {
      const team = store.create({ name: 'Test' });
      const result = store.update(team.id, {});

      expect(result?.name).toBe('Test');
    });

    it('should return undefined for non-existent id', () => {
      const result = store.update('non-existent', { name: 'New Name' });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete team and return true', () => {
      const team = store.create({ name: 'To Delete' });
      const result = store.delete(team.id);

      expect(result).toBe(true);
      expect(store.findById(team.id)).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const result = store.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('findMembers', () => {
    beforeEach(() => {
      const team = store.create({ name: 'Test Team' });
      store.addMember(team.id, 'user-1', 'lead');
      store.addMember(team.id, 'user-2', 'member');
    });

    it('should return all team members', () => {
      const team = store.findByName('Test Team')!;
      const members = store.findMembers(team.id);

      expect(members).toHaveLength(2);
    });

    it('should filter by role', () => {
      const team = store.findByName('Test Team')!;
      const leads = store.findMembers(team.id, { role: 'lead' });

      expect(leads).toHaveLength(1);
      expect(leads[0].role).toBe('lead');
    });

    it('should support pagination with limit', () => {
      const team = store.findByName('Test Team')!;
      const members = store.findMembers(team.id, { limit: 1 });

      expect(members).toHaveLength(1);
    });

    it('should support pagination with limit and offset', () => {
      const team = store.findByName('Test Team')!;
      const members = store.findMembers(team.id, { limit: 1, offset: 1 });

      expect(members).toHaveLength(1);
    });
  });

  describe('getMembership', () => {
    it('should return membership for existing member', () => {
      const team = store.create({ name: 'Test Team' });
      store.addMember(team.id, 'user-1', 'lead');

      const membership = store.getMembership(team.id, 'user-1');

      expect(membership?.role).toBe('lead');
    });

    it('should return undefined for non-member', () => {
      const team = store.create({ name: 'Test Team' });
      const membership = store.getMembership(team.id, 'user-1');

      expect(membership).toBeUndefined();
    });
  });

  describe('getMembershipsByUserId', () => {
    it('should return user memberships with team info', () => {
      const team1 = store.create({ name: 'Team One' });
      const team2 = store.create({ name: 'Team Two' });
      store.addMember(team1.id, 'user-1', 'lead');
      store.addMember(team2.id, 'user-1', 'member');

      const memberships = store.getMembershipsByUserId('user-1');

      expect(memberships).toHaveLength(2);
      expect(memberships[0].team_name).toBe('Team One');
      expect(memberships[1].team_name).toBe('Team Two');
    });

    it('should return empty array for user with no memberships', () => {
      const memberships = store.getMembershipsByUserId('user-1');
      expect(memberships).toHaveLength(0);
    });
  });

  describe('addMember and removeMember', () => {
    it('should add member to team', () => {
      const team = store.create({ name: 'Test Team' });
      const member = store.addMember(team.id, 'user-1', 'member');

      expect(member.team_id).toBe(team.id);
      expect(member.user_id).toBe('user-1');
      expect(member.role).toBe('member');
    });

    it('should remove member from team', () => {
      const team = store.create({ name: 'Test Team' });
      store.addMember(team.id, 'user-1', 'member');

      const result = store.removeMember(team.id, 'user-1');

      expect(result).toBe(true);
      expect(store.isMember(team.id, 'user-1')).toBe(false);
    });

    it('should return false when removing non-existent member', () => {
      const team = store.create({ name: 'Test Team' });
      const result = store.removeMember(team.id, 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('removeAllMembershipsForUser', () => {
    it('should remove user from all teams', () => {
      const team1 = store.create({ name: 'Team One' });
      const team2 = store.create({ name: 'Team Two' });
      store.addMember(team1.id, 'user-1', 'member');
      store.addMember(team2.id, 'user-1', 'member');

      const count = store.removeAllMembershipsForUser('user-1');

      expect(count).toBe(2);
      expect(store.getMembershipsByUserId('user-1')).toHaveLength(0);
    });

    it('should return 0 for user with no memberships', () => {
      const count = store.removeAllMembershipsForUser('user-1');
      expect(count).toBe(0);
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role', () => {
      const team = store.create({ name: 'Test Team' });
      store.addMember(team.id, 'user-1', 'member');

      const result = store.updateMemberRole(team.id, 'user-1', 'lead');

      expect(result).toBe(true);
      expect(store.getMembership(team.id, 'user-1')?.role).toBe('lead');
    });

    it('should return false for non-existent member', () => {
      const team = store.create({ name: 'Test Team' });
      const result = store.updateMemberRole(team.id, 'user-1', 'lead');

      expect(result).toBe(false);
    });
  });

  describe('isMember', () => {
    it('should return true for team member', () => {
      const team = store.create({ name: 'Test Team' });
      store.addMember(team.id, 'user-1', 'member');

      expect(store.isMember(team.id, 'user-1')).toBe(true);
    });

    it('should return false for non-member', () => {
      const team = store.create({ name: 'Test Team' });

      expect(store.isMember(team.id, 'user-1')).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing team', () => {
      const team = store.create({ name: 'Test Team' });
      expect(store.exists(team.id)).toBe(true);
    });

    it('should return false for non-existent team', () => {
      expect(store.exists('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return count of teams', () => {
      expect(store.count()).toBe(0);

      store.create({ name: 'Team 1' });
      store.create({ name: 'Team 2' });

      expect(store.count()).toBe(2);
    });
  });

  describe('getMemberCount', () => {
    it('should return count of team members', () => {
      const team = store.create({ name: 'Test Team' });

      expect(store.getMemberCount(team.id)).toBe(0);

      store.addMember(team.id, 'user-1', 'lead');
      store.addMember(team.id, 'user-2', 'member');

      expect(store.getMemberCount(team.id)).toBe(2);
    });
  });

  describe('getServiceCount', () => {
    it('should return count of team services', () => {
      const team = store.create({ name: 'Test Team' });

      expect(store.getServiceCount(team.id)).toBe(0);

      // Add services
      db.exec(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('svc-1', 'Service 1', '${team.id}', 'http://test/health');
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('svc-2', 'Service 2', '${team.id}', 'http://test/health');
      `);

      expect(store.getServiceCount(team.id)).toBe(2);
    });
  });
});
