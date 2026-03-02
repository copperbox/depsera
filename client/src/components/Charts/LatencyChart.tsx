import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchLatencyBuckets } from '../../api/latency';
import { LatencyBucket, LatencyRange } from '../../types/chart';
import { parseUtcDate } from '../../utils/formatting';
import { TimeRangeSelector } from './TimeRangeSelector';
import styles from './LatencyChart.module.css';

interface LatencyChartProps {
  dependencyId: string;
  dependencyName?: string;
  storageKey?: string;
}

const LATENCY_RANGES: LatencyRange[] = ['1h', '6h', '24h', '7d', '30d'];

function formatTimestamp(timestamp: string, range: LatencyRange): string {
  const date = parseUtcDate(timestamp);
  if (range === '1h' || range === '6h') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '24h') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipTimestamp(timestamp: string): string {
  const date = parseUtcDate(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ChartDataPoint {
  timestamp: string;
  min: number;
  avg: number;
  max: number;
  count: number;
  label: string;
}

export function LatencyChart({ dependencyId, dependencyName, storageKey }: LatencyChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [range, setRange] = useState<LatencyRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (selectedRange: LatencyRange) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchLatencyBuckets(dependencyId, selectedRange);
        setData(
          response.buckets.map((b: LatencyBucket) => ({
            ...b,
            min: Math.round(b.min),
            avg: Math.round(b.avg),
            max: Math.round(b.max),
            label: formatTimestamp(b.timestamp, selectedRange),
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load latency data');
      } finally {
        setIsLoading(false);
      }
    },
    [dependencyId]
  );

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const handleRangeChange = useCallback((newRange: LatencyRange | string) => {
    setRange(newRange as LatencyRange);
  }, []);

  const renderTooltipContent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const { payload, active } = props;
      if (!active || !payload || payload.length === 0) return null;
      const point = payload[0].payload as ChartDataPoint;
      return (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTime}>{formatTooltipTimestamp(point.timestamp)}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipDot} style={{ background: 'var(--color-chart-max)' }} />
            <span>Max: {point.max}ms</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipDot} style={{ background: 'var(--color-chart-avg)' }} />
            <span>Avg: {point.avg}ms</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipDot} style={{ background: 'var(--color-chart-min)' }} />
            <span>Min: {point.min}ms</span>
          </div>
          <div className={styles.tooltipCount}>{point.count} data points</div>
        </div>
      );
    },
    []
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          {dependencyName ? `${dependencyName} — Latency` : 'Latency'}
        </h4>
        <TimeRangeSelector
          ranges={LATENCY_RANGES}
          defaultRange="24h"
          storageKey={storageKey}
          onChange={handleRangeChange}
        />
      </div>
      <div className={styles.chartArea}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading latency data...</span>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <span>{error}</span>
            <button className={styles.retryButton} onClick={() => loadData(range)}>
              Retry
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span>No latency data available for this time range.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${Math.round(value)}ms`}
                width={60}
              />
              <Tooltip content={renderTooltipContent} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
              />
              <Line
                type="monotone"
                dataKey="max"
                stroke="var(--color-chart-max)"
                strokeWidth={1.5}
                dot={false}
                name="Max"
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="var(--color-chart-avg)"
                strokeWidth={2}
                dot={false}
                name="Avg"
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="min"
                stroke="var(--color-chart-min)"
                strokeWidth={1.5}
                dot={false}
                name="Min"
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
