import { useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  options: UsePollingOptions = {}
): void {
  const { interval = 2000, enabled = true } = options;
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      savedCallback.current();
    };

    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [interval, enabled]);
}

export function useInterval(
  callback: () => void,
  delay: number | null
): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export function useAsyncCallback<T extends (...args: unknown[]) => Promise<unknown>>(
  callback: T
): [T, boolean] {
  const isMounted = useRef(true);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const wrappedCallback = useCallback(
    async (...args: Parameters<T>) => {
      if (!isMounted.current) return;
      isLoadingRef.current = true;
      try {
        const result = await callback(...args);
        if (isMounted.current) {
          return result;
        }
      } finally {
        if (isMounted.current) {
          isLoadingRef.current = false;
        }
      }
    },
    [callback]
  ) as T;

  return [wrappedCallback, isLoadingRef.current];
}
