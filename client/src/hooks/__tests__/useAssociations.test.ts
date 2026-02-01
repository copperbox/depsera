import { renderHook, act } from '@testing-library/react';
import { useAssociations } from '../useAssociations';

jest.mock('../../api/associations');

import {
  fetchAssociations,
  createAssociation,
  deleteAssociation,
} from '../../api/associations';

const mockFetch = fetchAssociations as jest.MockedFunction<typeof fetchAssociations>;
const mockCreate = createAssociation as jest.MockedFunction<typeof createAssociation>;
const mockDelete = deleteAssociation as jest.MockedFunction<typeof deleteAssociation>;

beforeEach(() => {
  mockFetch.mockReset();
  mockCreate.mockReset();
  mockDelete.mockReset();
});

describe('useAssociations', () => {
  it('loads associations', async () => {
    const data = [{ id: 'a1', dependency_id: 'd1', linked_service_id: 's1' }] as never[];
    mockFetch.mockResolvedValue(data);

    const { result } = renderHook(() => useAssociations('d1'));

    await act(async () => {
      await result.current.loadAssociations();
    });

    expect(mockFetch).toHaveBeenCalledWith('d1');
    expect(result.current.associations).toEqual(data);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAssociations('d1'));

    await act(async () => {
      await result.current.loadAssociations();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('adds an association and reloads', async () => {
    mockCreate.mockResolvedValue({} as never);
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useAssociations('d1'));

    await act(async () => {
      await result.current.addAssociation({ linked_service_id: 's1', association_type: 'api_call' });
    });

    expect(mockCreate).toHaveBeenCalledWith('d1', { linked_service_id: 's1', association_type: 'api_call' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('removes an association optimistically', async () => {
    const data = [
      { id: 'a1', dependency_id: 'd1', linked_service_id: 's1' },
      { id: 'a2', dependency_id: 'd1', linked_service_id: 's2' },
    ] as never[];
    mockFetch.mockResolvedValue(data);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssociations('d1'));

    await act(async () => {
      await result.current.loadAssociations();
    });

    await act(async () => {
      await result.current.removeAssociation('s1');
    });

    expect(mockDelete).toHaveBeenCalledWith('d1', 's1');
    expect(result.current.associations).toHaveLength(1);
  });

  it('does nothing when dependencyId is undefined', async () => {
    const { result } = renderHook(() => useAssociations(undefined));

    await act(async () => {
      await result.current.loadAssociations();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
