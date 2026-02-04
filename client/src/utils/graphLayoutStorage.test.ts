import {
  saveNodePositions,
  loadNodePositions,
  clearNodePositions,
} from './graphLayoutStorage';

describe('graphLayoutStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const userId = 'user-123';

  describe('saveNodePositions / loadNodePositions', () => {
    it('saves and loads positions', () => {
      const positions = {
        'node-1': { x: 100, y: 200 },
        'node-2': { x: 300, y: 400 },
      };
      saveNodePositions(userId, positions);
      expect(loadNodePositions(userId)).toEqual(positions);
    });

    it('returns empty object when no saved data', () => {
      expect(loadNodePositions(userId)).toEqual({});
    });

    it('returns empty object for corrupted data', () => {
      localStorage.setItem('graph-node-positions-user-123', 'invalid json');
      expect(loadNodePositions(userId)).toEqual({});
    });

    it('returns empty object for non-object data', () => {
      localStorage.setItem('graph-node-positions-user-123', JSON.stringify([1, 2]));
      expect(loadNodePositions(userId)).toEqual({});
    });

    it('uses user-specific keys', () => {
      saveNodePositions('user-a', { 'n1': { x: 1, y: 2 } });
      saveNodePositions('user-b', { 'n1': { x: 3, y: 4 } });
      expect(loadNodePositions('user-a')).toEqual({ 'n1': { x: 1, y: 2 } });
      expect(loadNodePositions('user-b')).toEqual({ 'n1': { x: 3, y: 4 } });
    });
  });

  describe('clearNodePositions', () => {
    it('removes saved positions', () => {
      saveNodePositions(userId, { 'node-1': { x: 10, y: 20 } });
      clearNodePositions(userId);
      expect(loadNodePositions(userId)).toEqual({});
    });

    it('does not throw when nothing to clear', () => {
      expect(() => clearNodePositions(userId)).not.toThrow();
    });
  });
});
