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

    it('filters out entries with non-number coordinates', () => {
      localStorage.setItem(
        'graph-node-positions-user-123',
        JSON.stringify({
          'valid': { x: 10, y: 20 },
          'bad-string': { x: 'hello', y: 20 },
          'bad-null': { x: null, y: 20 },
          'bad-object': { x: {}, y: 20 },
        })
      );
      expect(loadNodePositions(userId)).toEqual({ 'valid': { x: 10, y: 20 } });
    });

    it('filters out entries with missing coordinates', () => {
      localStorage.setItem(
        'graph-node-positions-user-123',
        JSON.stringify({
          'valid': { x: 5, y: 15 },
          'no-x': { y: 20 },
          'no-y': { x: 10 },
          'empty': {},
        })
      );
      expect(loadNodePositions(userId)).toEqual({ 'valid': { x: 5, y: 15 } });
    });

    it('filters out entries with NaN or Infinity coordinates', () => {
      localStorage.setItem(
        'graph-node-positions-user-123',
        JSON.stringify({
          'valid': { x: 0, y: 0 },
          'nan': { x: NaN, y: 10 },
          'infinity': { x: 10, y: Infinity },
          'neg-infinity': { x: -Infinity, y: 10 },
        })
      );
      // NaN/Infinity become null in JSON.stringify, so they'll fail type checks
      expect(loadNodePositions(userId)).toEqual({ 'valid': { x: 0, y: 0 } });
    });

    it('filters out non-object entries', () => {
      localStorage.setItem(
        'graph-node-positions-user-123',
        JSON.stringify({
          'valid': { x: 1, y: 2 },
          'string': 'not-a-position',
          'number': 42,
          'null-val': null,
          'array': [1, 2],
        })
      );
      expect(loadNodePositions(userId)).toEqual({ 'valid': { x: 1, y: 2 } });
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
