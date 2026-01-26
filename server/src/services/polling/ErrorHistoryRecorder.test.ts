import { ErrorHistoryRecorder } from './ErrorHistoryRecorder';

// Mock the database
const mockEntries = new Map<string, { error: string | null; error_message: string | null }[]>();
const mockInserts: { dependency_id: string; error: string | null; error_message: string | null; recorded_at: string }[] = [];

jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    prepare: jest.fn((sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          get: (depId: string) => {
            const entries = mockEntries.get(depId) || [];
            return entries[entries.length - 1];
          },
        };
      }
      if (sql.includes('INSERT')) {
        // Recovery INSERT: VALUES (?, ?, NULL, NULL, ?) - 3 params
        // Error INSERT: VALUES (?, ?, ?, ?, ?) - 5 params
        const hasNullPlaceholders = sql.includes('NULL, NULL');
        return {
          run: (...args: (string | null)[]) => {
            let depId: string;
            let error: string | null;
            let errorMessage: string | null;
            let timestamp: string;

            if (hasNullPlaceholders) {
              // Recovery: (id, dependency_id, recorded_at)
              depId = args[1] as string;
              error = null;
              errorMessage = null;
              timestamp = args[2] as string;
            } else {
              // Error: (id, dependency_id, error, error_message, recorded_at)
              depId = args[1] as string;
              error = args[2] as string | null;
              errorMessage = args[3] as string | null;
              timestamp = args[4] as string;
            }

            mockInserts.push({ dependency_id: depId, error, error_message: errorMessage, recorded_at: timestamp });
            const entries = mockEntries.get(depId) || [];
            entries.push({ error, error_message: errorMessage });
            mockEntries.set(depId, entries);
          },
        };
      }
      return { run: jest.fn(), get: jest.fn() };
    }),
  },
}));

const resetMocks = () => {
  mockEntries.clear();
  mockInserts.length = 0;
};

describe('ErrorHistoryRecorder', () => {
  let recorder: ErrorHistoryRecorder;

  beforeEach(() => {
    recorder = new ErrorHistoryRecorder();
    resetMocks();
  });

  describe('record', () => {
    it('should not record when healthy and no previous entry', () => {
      recorder.record('dep-1', true, null, null, '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(0);
    });

    it('should not record when healthy and previous entry was also healthy', () => {
      // Set up previous healthy state
      mockEntries.set('dep-1', [{ error: null, error_message: null }]);

      recorder.record('dep-1', true, null, null, '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(0);
    });

    it('should record recovery when healthy after error', () => {
      // Set up previous error state
      mockEntries.set('dep-1', [{ error: '{"code":"TIMEOUT"}', error_message: 'Timeout' }]);

      recorder.record('dep-1', true, null, null, '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBeNull();
      expect(mockInserts[0].error_message).toBeNull();
    });

    it('should record first error', () => {
      const errorJson = '{"code":"TIMEOUT"}';
      recorder.record('dep-1', false, errorJson, 'Connection timeout', '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe(errorJson);
      expect(mockInserts[0].error_message).toBe('Connection timeout');
    });

    it('should record error after recovery', () => {
      // Set up previous recovery state
      mockEntries.set('dep-1', [{ error: null, error_message: null }]);

      const errorJson = '{"code":"TIMEOUT"}';
      recorder.record('dep-1', false, errorJson, 'Connection timeout', '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe(errorJson);
    });

    it('should record when error changes', () => {
      // Set up previous error state
      mockEntries.set('dep-1', [{ error: '{"code":"TIMEOUT"}', error_message: 'Timeout' }]);

      const newErrorJson = '{"code":"CONNECTION_REFUSED"}';
      recorder.record('dep-1', false, newErrorJson, 'Connection refused', '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe(newErrorJson);
    });

    it('should not record duplicate error', () => {
      const errorJson = '{"code":"TIMEOUT"}';
      // Set up previous error state with same error
      mockEntries.set('dep-1', [{ error: errorJson, error_message: 'Timeout' }]);

      recorder.record('dep-1', false, errorJson, 'Timeout', '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(0);
    });
  });
});
