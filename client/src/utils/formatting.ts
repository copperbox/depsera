/**
 * Parse a date string as UTC.
 *
 * SQLite's datetime('now') produces "YYYY-MM-DD HH:MM:SS" (UTC but without
 * a Z suffix or timezone offset). Without normalization, the browser's
 * Date constructor treats these as local time, causing times to display
 * as UTC instead of the user's local timezone.
 *
 * This function ensures all server timestamps are correctly interpreted as UTC.
 */
export function parseUtcDate(dateString: string): Date {
  const s = dateString.trim();
  // Already has timezone info (Z or +/-HH:MM offset) — parse as-is
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  // SQLite format "YYYY-MM-DD HH:MM:SS" — normalize to ISO 8601 UTC
  return new Date(s.replace(' ', 'T') + 'Z');
}

/**
 * Format a date string as a relative time (e.g., "5m ago", "2h ago")
 * @param dateString - ISO date string or null
 * @returns Formatted relative time string
 */
export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = parseUtcDate(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Format a date string as a localized short timestamp (e.g., "Jan 15, 12:00 PM")
 * Uses the user's locale and local timezone.
 */
export function formatTimestamp(dateString: string): string {
  const date = parseUtcDate(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date string as a localized date (e.g., "Jan 15, 2024")
 * Uses the user's locale and local timezone.
 */
export function formatDate(dateString: string): string {
  return parseUtcDate(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
