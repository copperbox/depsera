import { ServicePollHistoryRecorder } from './ServicePollHistoryRecorder';
import { ServicePollHistoryEntry } from '../../stores/types';

// Mock the stores
const mockEntries = new Map<string, { error: string | null }[]>();
const mockInserts: { service_id: string; error: string | null; recorded_at: string }[] = [];

const mockServicePollHistoryStore = {
  getLastEntry: jest.fn((serviceId: string): ServicePollHistoryEntry | undefined => {
    const entries = mockEntries.get(serviceId) || [];
    const last = entries[entries.length - 1];
    if (!last) return undefined;
    return {
      id: 'mock-id',
      service_id: serviceId,
      error: last.error,
      recorded_at: '2024-01-01T00:00:00Z',
    };
  }),
  record: jest.fn((serviceId: string, error: string | null, timestamp: string) => {
    mockInserts.push({
      service_id: serviceId,
      error,
      recorded_at: timestamp,
    });
    const entries = mockEntries.get(serviceId) || [];
    entries.push({ error });
    mockEntries.set(serviceId, entries);
    return {
      id: 'mock-id',
      service_id: serviceId,
      error,
      recorded_at: timestamp,
    };
  }),
};

jest.mock('../../stores', () => ({
  getStores: jest.fn(() => ({
    servicePollHistory: mockServicePollHistoryStore,
  })),
}));

const resetMocks = () => {
  mockEntries.clear();
  mockInserts.length = 0;
  jest.clearAllMocks();
};

describe('ServicePollHistoryRecorder', () => {
  let recorder: ServicePollHistoryRecorder;

  beforeEach(() => {
    recorder = new ServicePollHistoryRecorder();
    resetMocks();
  });

  describe('record', () => {
    it('should record first error', () => {
      recorder.record('svc-1', false, 'Connection refused', '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe('Connection refused');
    });

    it('should skip duplicate error (same message)', () => {
      // Set up previous error state with same message
      mockEntries.set('svc-1', [{ error: 'Connection refused' }]);

      recorder.record('svc-1', false, 'Connection refused', '2024-01-01T00:01:00Z');

      expect(mockInserts).toHaveLength(0);
    });

    it('should record when error message changes', () => {
      // Set up previous error state
      mockEntries.set('svc-1', [{ error: 'Connection refused' }]);

      recorder.record('svc-1', false, 'Timeout', '2024-01-01T00:01:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe('Timeout');
    });

    it('should record recovery (success after failure)', () => {
      // Set up previous error state
      mockEntries.set('svc-1', [{ error: 'Connection refused' }]);

      recorder.record('svc-1', true, undefined, '2024-01-01T00:01:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBeNull();
    });

    it('should skip duplicate success (success after success)', () => {
      // Set up previous recovery state
      mockEntries.set('svc-1', [{ error: null }]);

      recorder.record('svc-1', true, undefined, '2024-01-01T00:01:00Z');

      expect(mockInserts).toHaveLength(0);
    });

    it('should not record first success (no previous entries)', () => {
      recorder.record('svc-1', true, undefined, '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(0);
    });

    it('should record error after recovery', () => {
      // Set up previous recovery state
      mockEntries.set('svc-1', [{ error: null }]);

      recorder.record('svc-1', false, 'Server error', '2024-01-01T00:01:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe('Server error');
    });

    it('should use "Unknown poll error" when error is undefined', () => {
      recorder.record('svc-1', false, undefined, '2024-01-01T00:00:00Z');

      expect(mockInserts).toHaveLength(1);
      expect(mockInserts[0].error).toBe('Unknown poll error');
    });

    it('should deduplicate "Unknown poll error" when repeated', () => {
      // First call records it
      recorder.record('svc-1', false, undefined, '2024-01-01T00:00:00Z');
      expect(mockInserts).toHaveLength(1);

      // Second call should be deduped (same effective error)
      recorder.record('svc-1', false, undefined, '2024-01-01T00:01:00Z');
      expect(mockInserts).toHaveLength(1);
    });
  });
});
