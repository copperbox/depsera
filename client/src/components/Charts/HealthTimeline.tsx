import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHealthTimeline } from '../../api/timeline';
import { HealthTimelineResponse, HealthTransition, TimelineRange } from '../../types/chart';
import { parseUtcDate } from '../../utils/formatting';
import { TimeRangeSelector } from './TimeRangeSelector';
import styles from './HealthTimeline.module.css';

interface HealthTimelineProps {
  dependencyId: string;
  dependencyName?: string;
  storageKey?: string;
}

const TIMELINE_RANGES: TimelineRange[] = ['24h', '7d', '30d'];

interface Segment {
  state: 'healthy' | 'unhealthy' | 'unknown';
  startTime: Date;
  endTime: Date;
  widthPercent: number;
}

function getRangeMs(range: TimelineRange): number {
  switch (range) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
  }
}

function buildSegments(
  transitions: HealthTransition[],
  currentState: string,
  range: TimelineRange
): Segment[] {
  const now = new Date();
  const rangeMs = getRangeMs(range);
  const rangeStart = new Date(now.getTime() - rangeMs);

  if (transitions.length === 0) {
    return [
      {
        state: currentState === 'healthy' ? 'healthy' : currentState === 'unhealthy' ? 'unhealthy' : 'unknown',
        startTime: rangeStart,
        endTime: now,
        widthPercent: 100,
      },
    ];
  }

  const sorted = [...transitions].sort(
    (a, b) => parseUtcDate(a.timestamp).getTime() - parseUtcDate(b.timestamp).getTime()
  );

  const segments: Segment[] = [];

  // The state before the first transition is the inverse of the first transition
  const firstTransitionState = sorted[0].state;
  const initialState: 'healthy' | 'unhealthy' =
    firstTransitionState === 'healthy' ? 'unhealthy' : 'healthy';

  let currentSegmentState: 'healthy' | 'unhealthy' | 'unknown' = initialState;
  let currentSegmentStart = rangeStart;

  for (const transition of sorted) {
    const transitionTime = parseUtcDate(transition.timestamp);

    // Clamp to range
    if (transitionTime < rangeStart) {
      currentSegmentState = transition.state;
      continue;
    }

    if (transitionTime > now) break;

    // Close current segment
    if (transitionTime.getTime() > currentSegmentStart.getTime()) {
      const duration = transitionTime.getTime() - currentSegmentStart.getTime();
      segments.push({
        state: currentSegmentState,
        startTime: currentSegmentStart,
        endTime: transitionTime,
        widthPercent: (duration / rangeMs) * 100,
      });
    }

    currentSegmentState = transition.state;
    currentSegmentStart = transitionTime;
  }

  // Final segment to now
  const finalDuration = now.getTime() - currentSegmentStart.getTime();
  if (finalDuration > 0) {
    segments.push({
      state: currentSegmentState,
      startTime: currentSegmentStart,
      endTime: now,
      widthPercent: (finalDuration / rangeMs) * 100,
    });
  }

  return segments;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.round((ms % 86400000) / 3600000);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HealthTimeline({ dependencyId, dependencyName, storageKey }: HealthTimelineProps) {
  const [data, setData] = useState<HealthTimelineResponse | null>(null);
  const [range, setRange] = useState<TimelineRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const loadData = useCallback(
    async (selectedRange: TimelineRange) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchHealthTimeline(dependencyId, selectedRange);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timeline data');
      } finally {
        setIsLoading(false);
      }
    },
    [dependencyId]
  );

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const handleRangeChange = useCallback((newRange: TimelineRange | string) => {
    setRange(newRange as TimelineRange);
  }, []);

  const segments = useMemo(() => {
    if (!data) return [];
    return buildSegments(data.transitions, data.currentState, range);
  }, [data, range]);

  const rangeMs = getRangeMs(range);
  const rangeStart = new Date(Date.now() - rangeMs);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          {dependencyName ? `${dependencyName} — Health Timeline` : 'Health Timeline'}
        </h4>
        <TimeRangeSelector
          ranges={TIMELINE_RANGES}
          defaultRange="24h"
          storageKey={storageKey}
          onChange={handleRangeChange}
        />
      </div>
      <div className={styles.chartArea}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading timeline...</span>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <span>{error}</span>
            <button className={styles.retryButton} onClick={() => loadData(range)}>
              Retry
            </button>
          </div>
        ) : segments.length === 0 ? (
          <div className={styles.emptyState}>
            <span>No health data available for this time range.</span>
          </div>
        ) : (
          <div className={styles.timelineWrapper}>
            <div className={styles.bar} role="img" aria-label="Health timeline">
              {segments.map((segment, i) => (
                <div
                  key={i}
                  className={`${styles.segment} ${styles[segment.state]}`}
                  style={{ width: `${segment.widthPercent}%` }}
                  onMouseEnter={() => setHoveredSegment(i)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  aria-label={`${segment.state} for ${formatDuration(segment.endTime.getTime() - segment.startTime.getTime())}`}
                >
                  {hoveredSegment === i && (
                    <div className={styles.segmentTooltip}>
                      <div className={styles.segmentTooltipState}>
                        <span
                          className={`${styles.statusDot} ${styles[`dot${segment.state.charAt(0).toUpperCase()}${segment.state.slice(1)}`]}`}
                        />
                        {segment.state.charAt(0).toUpperCase() + segment.state.slice(1)}
                      </div>
                      <div className={styles.segmentTooltipTime}>
                        {formatTimestamp(segment.startTime)} — {formatTimestamp(segment.endTime)}
                      </div>
                      <div className={styles.segmentTooltipDuration}>
                        Duration:{' '}
                        {formatDuration(
                          segment.endTime.getTime() - segment.startTime.getTime()
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.timeAxis}>
              <span className={styles.timeLabel}>{formatTimestamp(rangeStart)}</span>
              <span className={styles.timeLabel}>Now</span>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.healthy}`} />
                Healthy
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.unhealthy}`} />
                Unhealthy
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.unknown}`} />
                Unknown
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
