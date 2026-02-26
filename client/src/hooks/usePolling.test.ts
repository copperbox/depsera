import { renderHook, act } from '@testing-library/react';
import { usePolling, INTERVAL_OPTIONS } from './usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports interval options', () => {
    expect(INTERVAL_OPTIONS).toEqual([
      { value: 10000, label: '10s' },
      { value: 20000, label: '20s' },
      { value: 30000, label: '30s' },
      { value: 60000, label: '1m' },
    ]);
  });

  it('initializes with default values when localStorage is empty', () => {
    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    expect(result.current.isPollingEnabled).toBe(true);
    expect(result.current.pollingInterval).toBe(30000);
  });

  it('initializes from localStorage', () => {
    localStorage.setItem('test-auto-refresh', 'true');
    localStorage.setItem('test-refresh-interval', '10000');

    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    expect(result.current.isPollingEnabled).toBe(true);
    expect(result.current.pollingInterval).toBe(10000);
  });

  it('toggles polling on and off', () => {
    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    expect(result.current.isPollingEnabled).toBe(true);

    act(() => {
      result.current.togglePolling();
    });

    expect(result.current.isPollingEnabled).toBe(false);
    expect(localStorage.getItem('test-auto-refresh')).toBe('false');

    act(() => {
      result.current.togglePolling();
    });

    expect(result.current.isPollingEnabled).toBe(true);
    expect(localStorage.getItem('test-auto-refresh')).toBe('true');
  });

  it('changes polling interval', () => {
    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    act(() => {
      result.current.handleIntervalChange({
        target: { value: '60000' },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    expect(result.current.pollingInterval).toBe(60000);
    expect(localStorage.getItem('test-refresh-interval')).toBe('60000');
  });

  it('calls onPoll at specified interval when enabled', () => {
    localStorage.setItem('test-auto-refresh', 'true');
    localStorage.setItem('test-refresh-interval', '10000');

    const onPoll = jest.fn();
    renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    expect(onPoll).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onPoll).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it('does not call onPoll when disabled', () => {
    localStorage.setItem('test-auto-refresh', 'false');
    const onPoll = jest.fn();
    renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(onPoll).not.toHaveBeenCalled();
  });

  it('clears interval when disabled', () => {
    localStorage.setItem('test-auto-refresh', 'true');

    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    act(() => {
      jest.advanceTimersByTime(30000);
    });

    expect(onPoll).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.togglePolling();
    });

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    // Still only 1 call since polling is now disabled
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it('clears interval on unmount', () => {
    localStorage.setItem('test-auto-refresh', 'true');

    const onPoll = jest.fn();
    const { unmount } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    unmount();

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(onPoll).not.toHaveBeenCalled();
  });

  it('updates onPoll ref when callback changes', () => {
    localStorage.setItem('test-auto-refresh', 'true');
    localStorage.setItem('test-refresh-interval', '10000');

    const onPoll1 = jest.fn();
    const onPoll2 = jest.fn();

    const { rerender } = renderHook(
      ({ onPoll }) => usePolling({ storageKey: 'test', onPoll }),
      { initialProps: { onPoll: onPoll1 } }
    );

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onPoll1).toHaveBeenCalledTimes(1);
    expect(onPoll2).not.toHaveBeenCalled();

    rerender({ onPoll: onPoll2 });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onPoll1).toHaveBeenCalledTimes(1);
    expect(onPoll2).toHaveBeenCalledTimes(1);
  });

  it('restarts interval when interval changes', () => {
    localStorage.setItem('test-auto-refresh', 'true');
    localStorage.setItem('test-refresh-interval', '30000');

    const onPoll = jest.fn();
    const { result } = renderHook(() => usePolling({ storageKey: 'test', onPoll }));

    // Change interval to 10s
    act(() => {
      result.current.handleIntervalChange({
        target: { value: '10000' },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onPoll).toHaveBeenCalledTimes(1);
  });
});
