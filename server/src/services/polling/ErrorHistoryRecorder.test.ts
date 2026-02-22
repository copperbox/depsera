import { ErrorHistoryRecorder } from './ErrorHistoryRecorder';
import { DependencyErrorHistory } from '../../db/types';

// Mock the stores
const mockEntries = new Map<string, { error: string | null; error_message: string | null }[]>();
const mockInserts: { dependency_id: string; error: string | null; error_message: string | null; recorded_at: string }[] = [];

const mockErrorHistoryStore = {
  getLastEntry: jest.fn((depId: string): DependencyErrorHistory | undefined => {
    const entries = mockEntries.get(depId) || [];
    const last = entries[entries.length - 1];
    if (!last) return undefined;
    return {
      id: 'mock-id',
      dependency_id: depId,
      error: last.error,
      error_message: last.error_message,
      recorded_at: '2024-01-01T00:00:00Z',
    };
  }),
  record: jest.fn((dependencyId: string, error: string | null, errorMessage: string | null, timestamp: string) => {
    mockInserts.push({
      dependency_id: dependencyId,
      error,
      error_message: errorMessage,
      recorded_at: timestamp,
    });
    const entries = mockEntries.get(dependencyId) || [];
    entries.push({ error, error_message: errorMessage });
    mockEntries.set(dependencyId, entries);
    return {
      id: 'mock-id',
      dependency_id: dependencyId,
      error,
      error_message: errorMessage,
      recorded_at: timestamp,
    };
  }),
};

jest.mock('../../stores', () => ({
  getStores: jest.fn(() => ({
    errorHistory: mockErrorHistoryStore,
  })),
}));

const resetMocks = () => {
  mockEntries.clear();
  mockInserts.length = 0;
  jest.clearAllMocks();
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
