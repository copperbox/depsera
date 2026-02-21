import { useCallback, useEffect, useState } from 'react';
import { ChartRange } from '../../types/chart';
import styles from './TimeRangeSelector.module.css';

interface TimeRangeSelectorProps {
  ranges: ChartRange[];
  defaultRange: ChartRange;
  storageKey?: string;
  onChange: (range: ChartRange) => void;
}

export function TimeRangeSelector({
  ranges,
  defaultRange,
  storageKey,
  onChange,
}: TimeRangeSelectorProps) {
  const [selected, setSelected] = useState<ChartRange>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored && ranges.includes(stored as ChartRange)) {
          return stored as ChartRange;
        }
      } catch {
        // Ignore localStorage errors
      }
    }
    return defaultRange;
  });

  useEffect(() => {
    onChange(selected);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (range: ChartRange) => {
      setSelected(range);
      onChange(range);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, range);
        } catch {
          // Ignore localStorage errors
        }
      }
    },
    [onChange, storageKey]
  );

  return (
    <div className={styles.container} role="group" aria-label="Time range selector">
      {ranges.map((range) => (
        <button
          key={range}
          className={`${styles.button} ${selected === range ? styles.active : ''}`}
          onClick={() => handleSelect(range)}
          aria-pressed={selected === range}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
