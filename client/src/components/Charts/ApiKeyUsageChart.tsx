import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiKeyUsage, getAdminApiKeyUsage } from '../../api/otlpStats';
import { ApiKeyUsageBucket } from '../../types/otlpStats';
import { LatencyRange } from '../../types/chart';
import { parseUtcDate } from '../../utils/formatting';
import { TimeRangeSelector } from './TimeRangeSelector';
import styles from './ApiKeyUsageChart.module.css';

interface ApiKeyUsageChartProps {
  teamId?: string;
  apiKeyId: string;
  keyName: string;
  keyPrefix: string;
  isAdmin?: boolean;
}

type UsageRange = '1h' | '6h' | '24h' | '7d' | '30d';
const USAGE_RANGES: UsageRange[] = ['1h', '6h', '24h', '7d', '30d'];

const RANGE_DURATIONS_MS: Record<UsageRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function getGranularity(range: UsageRange): 'minute' | 'hour' {
  return range === '7d' || range === '30d' ? 'hour' : 'minute';
}

interface ChartDataPoint extends ApiKeyUsageBucket {
  label: string;
}

function formatBucketTime(bucketStart: string, granularity: 'minute' | 'hour'): string {
  const date = parseUtcDate(bucketStart);
  if (granularity === 'minute') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
}

function formatTooltipTimestamp(bucketStart: string): string {
  const date = parseUtcDate(bucketStart);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ApiKeyUsageChart({
  teamId,
  apiKeyId,
  keyName,
  keyPrefix,
  isAdmin,
}: ApiKeyUsageChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [range, setRange] = useState<UsageRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (selectedRange: UsageRange) => {
      setIsLoading(true);
      setError(null);
      try {
        const now = new Date();
        const from = new Date(now.getTime() - RANGE_DURATIONS_MS[selectedRange]).toISOString();
        const to = now.toISOString();
        const granularity = getGranularity(selectedRange);

        const response =
          isAdmin || !teamId
            ? await getAdminApiKeyUsage(apiKeyId, { from, to, granularity })
            : await getApiKeyUsage(teamId, apiKeyId, { from, to, granularity });

        setData(
          response.buckets.map((b: ApiKeyUsageBucket) => ({
            ...b,
            label: formatBucketTime(b.bucket_start, granularity),
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load usage data');
      } finally {
        setIsLoading(false);
      }
    },
    [apiKeyId, teamId, isAdmin]
  );

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const handleRangeChange = useCallback((newRange: LatencyRange | string) => {
    setRange(newRange as UsageRange);
  }, []);

  const renderTooltipContent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const { payload, active } = props;
      if (!active || !payload || payload.length === 0) return null;
      const point = payload[0].payload as ChartDataPoint;
      return (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTime}>{formatTooltipTimestamp(point.bucket_start)}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipDot} style={{ background: '#3b82f6' }} />
            <span>Pushes: {point.push_count.toLocaleString()}</span>
          </div>
          {point.rejected_count > 0 && (
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipDot} style={{ background: '#ef4444' }} />
              <span>Rejected: {point.rejected_count.toLocaleString()}</span>
            </div>
          )}
        </div>
      );
    },
    []
  );

  const title = keyName ? `${keyName} (${keyPrefix}) — Usage` : `${keyPrefix} — Usage`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>{title}</h4>
        <TimeRangeSelector
          ranges={USAGE_RANGES}
          defaultRange="24h"
          storageKey={`apiKeyUsageChart-${apiKeyId}`}
          onChange={handleRangeChange}
        />
      </div>
      <div className={styles.chartArea}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading usage data...</span>
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
            <span>No push data for this period.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                tickFormatter={(value: number) => value.toLocaleString()}
                width={60}
              />
              <Tooltip content={renderTooltipContent} />
              <Bar dataKey="push_count" fill="#3b82f6" name="Pushes" stackId="a" />
              <Bar dataKey="rejected_count" fill="#ef4444" name="Rejected" stackId="a" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
