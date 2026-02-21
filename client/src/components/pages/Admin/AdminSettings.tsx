import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSettings, updateSettings } from '../../../api/settings';
import type { SettingValue } from '../../../api/settings';
import styles from './AdminSettings.module.css';

type SettingsData = Record<string, SettingValue>;

interface FormValues {
  data_retention_days: string;
  retention_cleanup_time: string;
  default_poll_interval_ms: string;
  ssrf_allowlist: string;
  global_rate_limit: string;
  global_rate_limit_window_minutes: string;
  auth_rate_limit: string;
  auth_rate_limit_window_minutes: string;
  alert_cooldown_minutes: string;
  alert_rate_limit_per_hour: string;
}

type FormKey = keyof FormValues;

interface ValidationErrors {
  [key: string]: string;
}

function settingsToForm(settings: SettingsData): FormValues {
  const get = (key: string): string => {
    const entry = settings[key];
    if (!entry) return '';
    // For ssrf_allowlist, convert comma-separated to newline-separated
    if (key === 'ssrf_allowlist') {
      const val = String(entry.value);
      return val ? val.split(',').map((s) => s.trim()).filter(Boolean).join('\n') : '';
    }
    return String(entry.value);
  };

  return {
    data_retention_days: get('data_retention_days'),
    retention_cleanup_time: get('retention_cleanup_time'),
    default_poll_interval_ms: get('default_poll_interval_ms'),
    ssrf_allowlist: get('ssrf_allowlist'),
    global_rate_limit: get('global_rate_limit'),
    global_rate_limit_window_minutes: get('global_rate_limit_window_minutes'),
    auth_rate_limit: get('auth_rate_limit'),
    auth_rate_limit_window_minutes: get('auth_rate_limit_window_minutes'),
    alert_cooldown_minutes: get('alert_cooldown_minutes'),
    alert_rate_limit_per_hour: get('alert_rate_limit_per_hour'),
  };
}

function validateForm(values: FormValues): ValidationErrors {
  const errors: ValidationErrors = {};

  const intInRange = (key: FormKey, min: number, max: number, label: string) => {
    const n = parseInt(values[key], 10);
    if (isNaN(n) || n < min || n > max) {
      errors[key] = `${label} must be between ${min} and ${max}`;
    }
  };

  intInRange('data_retention_days', 1, 3650, 'Retention period');
  intInRange('default_poll_interval_ms', 5000, 3600000, 'Poll interval');
  intInRange('global_rate_limit', 1, 10000, 'Global rate limit');
  intInRange('global_rate_limit_window_minutes', 1, 1440, 'Global window');
  intInRange('auth_rate_limit', 1, 1000, 'Auth rate limit');
  intInRange('auth_rate_limit_window_minutes', 1, 1440, 'Auth window');
  intInRange('alert_cooldown_minutes', 0, 1440, 'Alert cooldown');
  intInRange('alert_rate_limit_per_hour', 1, 1000, 'Alert rate limit');

  // Validate time format
  const time = values.retention_cleanup_time;
  if (!/^\d{2}:\d{2}$/.test(time)) {
    errors.retention_cleanup_time = 'Must be in HH:MM format';
  } else {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      errors.retention_cleanup_time = 'Must be a valid time (00:00-23:59)';
    }
  }

  return errors;
}

function AdminSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({
    data_retention_days: '',
    retention_cleanup_time: '',
    default_poll_interval_ms: '',
    ssrf_allowlist: '',
    global_rate_limit: '',
    global_rate_limit_window_minutes: '',
    auth_rate_limit: '',
    auth_rate_limit_window_minutes: '',
    alert_cooldown_minutes: '',
    alert_rate_limit_per_hour: '',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(['retention', 'polling', 'security', 'alerts']),
  );
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setFormValues(settingsToForm(data.settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const handleChange = (key: FormKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    // Clear validation error for this field on change
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    // Clear success/error messages on edit
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    const errors = validateForm(formValues);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Convert newline-separated ssrf_allowlist back to comma-separated
      const ssrfValue = formValues.ssrf_allowlist
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(',');

      const updates: Record<string, string | number> = {
        data_retention_days: parseInt(formValues.data_retention_days, 10),
        retention_cleanup_time: formValues.retention_cleanup_time,
        default_poll_interval_ms: parseInt(formValues.default_poll_interval_ms, 10),
        ssrf_allowlist: ssrfValue,
        global_rate_limit: parseInt(formValues.global_rate_limit, 10),
        global_rate_limit_window_minutes: parseInt(formValues.global_rate_limit_window_minutes, 10),
        auth_rate_limit: parseInt(formValues.auth_rate_limit, 10),
        auth_rate_limit_window_minutes: parseInt(formValues.auth_rate_limit_window_minutes, 10),
        alert_cooldown_minutes: parseInt(formValues.alert_cooldown_minutes, 10),
        alert_rate_limit_per_hour: parseInt(formValues.alert_rate_limit_per_hour, 10),
      };

      const result = await updateSettings(updates);
      setFormValues(settingsToForm(result.settings));
      setSaveSuccess(true);

      // Auto-dismiss success after 5 seconds
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadSettings} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>

      {saveSuccess && (
        <div className={styles.successBanner} role="status">
          Settings saved successfully. Changes take effect immediately.
          <button onClick={() => setSaveSuccess(false)} className={styles.dismissButton}>
            Dismiss
          </button>
        </div>
      )}

      {saveError && (
        <div className={styles.errorBanner}>
          {saveError}
          <button onClick={() => setSaveError(null)} className={styles.dismissButton}>
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.sections}>
        {/* Data Retention Section */}
        <section className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('retention')}
            aria-expanded={expandedSections.has('retention')}
          >
            <h2 className={styles.sectionTitle}>Data Retention</h2>
            <svg
              className={`${styles.chevron} ${expandedSections.has('retention') ? styles.chevronExpanded : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {expandedSections.has('retention') && (
            <div className={styles.sectionBody}>
              <p className={styles.sectionDescription}>
                Configure how long historical data is retained before automatic cleanup.
              </p>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="data_retention_days">
                    Retention period (days)
                  </label>
                  <input
                    id="data_retention_days"
                    type="number"
                    min="1"
                    max="3650"
                    value={formValues.data_retention_days}
                    onChange={(e) => handleChange('data_retention_days', e.target.value)}
                    className={`${styles.input} ${validationErrors.data_retention_days ? styles.inputError : ''}`}
                  />
                  {validationErrors.data_retention_days && (
                    <span className={styles.fieldError}>{validationErrors.data_retention_days}</span>
                  )}
                  <span className={styles.hint}>1-3650 days. Applies to latency history, error history, and audit log.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="retention_cleanup_time">
                    Daily cleanup time
                  </label>
                  <input
                    id="retention_cleanup_time"
                    type="time"
                    value={formValues.retention_cleanup_time}
                    onChange={(e) => handleChange('retention_cleanup_time', e.target.value)}
                    className={`${styles.input} ${validationErrors.retention_cleanup_time ? styles.inputError : ''}`}
                  />
                  {validationErrors.retention_cleanup_time && (
                    <span className={styles.fieldError}>{validationErrors.retention_cleanup_time}</span>
                  )}
                  <span className={styles.hint}>Local server time. Cleanup runs once daily at this time.</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Polling Defaults Section */}
        <section className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('polling')}
            aria-expanded={expandedSections.has('polling')}
          >
            <h2 className={styles.sectionTitle}>Polling Defaults</h2>
            <svg
              className={`${styles.chevron} ${expandedSections.has('polling') ? styles.chevronExpanded : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {expandedSections.has('polling') && (
            <div className={styles.sectionBody}>
              <p className={styles.sectionDescription}>
                Default polling interval for newly created services. Individual services can override this.
              </p>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="default_poll_interval_ms">
                    Default poll interval (ms)
                  </label>
                  <input
                    id="default_poll_interval_ms"
                    type="number"
                    min="5000"
                    max="3600000"
                    step="1000"
                    value={formValues.default_poll_interval_ms}
                    onChange={(e) => handleChange('default_poll_interval_ms', e.target.value)}
                    className={`${styles.input} ${validationErrors.default_poll_interval_ms ? styles.inputError : ''}`}
                  />
                  {validationErrors.default_poll_interval_ms && (
                    <span className={styles.fieldError}>{validationErrors.default_poll_interval_ms}</span>
                  )}
                  <span className={styles.hint}>5,000-3,600,000 ms (5 seconds to 1 hour).</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Security Section */}
        <section className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('security')}
            aria-expanded={expandedSections.has('security')}
          >
            <h2 className={styles.sectionTitle}>Security</h2>
            <svg
              className={`${styles.chevron} ${expandedSections.has('security') ? styles.chevronExpanded : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {expandedSections.has('security') && (
            <div className={styles.sectionBody}>
              <p className={styles.sectionDescription}>
                SSRF allowlist and rate limiting configuration.
              </p>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ssrf_allowlist">
                  SSRF allowlist
                </label>
                <textarea
                  id="ssrf_allowlist"
                  rows={4}
                  value={formValues.ssrf_allowlist}
                  onChange={(e) => handleChange('ssrf_allowlist', e.target.value)}
                  className={styles.textarea}
                  placeholder={'localhost\n*.internal\n10.0.0.0/8'}
                />
                <span className={styles.hint}>
                  One entry per line. Supports exact hostnames, wildcard patterns (*.internal), and CIDR ranges (10.0.0.0/8).
                </span>
              </div>

              <h3 className={styles.subsectionTitle}>Global Rate Limit</h3>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="global_rate_limit">
                    Max requests per window
                  </label>
                  <input
                    id="global_rate_limit"
                    type="number"
                    min="1"
                    max="10000"
                    value={formValues.global_rate_limit}
                    onChange={(e) => handleChange('global_rate_limit', e.target.value)}
                    className={`${styles.input} ${validationErrors.global_rate_limit ? styles.inputError : ''}`}
                  />
                  {validationErrors.global_rate_limit && (
                    <span className={styles.fieldError}>{validationErrors.global_rate_limit}</span>
                  )}
                  <span className={styles.hint}>1-10,000 requests per IP per window.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="global_rate_limit_window_minutes">
                    Window (minutes)
                  </label>
                  <input
                    id="global_rate_limit_window_minutes"
                    type="number"
                    min="1"
                    max="1440"
                    value={formValues.global_rate_limit_window_minutes}
                    onChange={(e) => handleChange('global_rate_limit_window_minutes', e.target.value)}
                    className={`${styles.input} ${validationErrors.global_rate_limit_window_minutes ? styles.inputError : ''}`}
                  />
                  {validationErrors.global_rate_limit_window_minutes && (
                    <span className={styles.fieldError}>{validationErrors.global_rate_limit_window_minutes}</span>
                  )}
                  <span className={styles.hint}>1-1,440 minutes (up to 24 hours).</span>
                </div>
              </div>

              <h3 className={styles.subsectionTitle}>Auth Rate Limit</h3>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="auth_rate_limit">
                    Max requests per window
                  </label>
                  <input
                    id="auth_rate_limit"
                    type="number"
                    min="1"
                    max="1000"
                    value={formValues.auth_rate_limit}
                    onChange={(e) => handleChange('auth_rate_limit', e.target.value)}
                    className={`${styles.input} ${validationErrors.auth_rate_limit ? styles.inputError : ''}`}
                  />
                  {validationErrors.auth_rate_limit && (
                    <span className={styles.fieldError}>{validationErrors.auth_rate_limit}</span>
                  )}
                  <span className={styles.hint}>1-1,000 requests per IP per window.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="auth_rate_limit_window_minutes">
                    Window (minutes)
                  </label>
                  <input
                    id="auth_rate_limit_window_minutes"
                    type="number"
                    min="1"
                    max="1440"
                    value={formValues.auth_rate_limit_window_minutes}
                    onChange={(e) => handleChange('auth_rate_limit_window_minutes', e.target.value)}
                    className={`${styles.input} ${validationErrors.auth_rate_limit_window_minutes ? styles.inputError : ''}`}
                  />
                  {validationErrors.auth_rate_limit_window_minutes && (
                    <span className={styles.fieldError}>{validationErrors.auth_rate_limit_window_minutes}</span>
                  )}
                  <span className={styles.hint}>1-1,440 minutes (up to 24 hours).</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Alerts Section */}
        <section className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('alerts')}
            aria-expanded={expandedSections.has('alerts')}
          >
            <h2 className={styles.sectionTitle}>Alerts</h2>
            <svg
              className={`${styles.chevron} ${expandedSections.has('alerts') ? styles.chevronExpanded : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {expandedSections.has('alerts') && (
            <div className={styles.sectionBody}>
              <p className={styles.sectionDescription}>
                Alert throttling configuration. These settings apply when alerting is enabled.
              </p>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="alert_cooldown_minutes">
                    Alert cooldown (minutes)
                  </label>
                  <input
                    id="alert_cooldown_minutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={formValues.alert_cooldown_minutes}
                    onChange={(e) => handleChange('alert_cooldown_minutes', e.target.value)}
                    className={`${styles.input} ${validationErrors.alert_cooldown_minutes ? styles.inputError : ''}`}
                  />
                  {validationErrors.alert_cooldown_minutes && (
                    <span className={styles.fieldError}>{validationErrors.alert_cooldown_minutes}</span>
                  )}
                  <span className={styles.hint}>0-1,440 minutes. Suppresses repeated alerts for the same dependency.</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="alert_rate_limit_per_hour">
                    Max alerts per hour
                  </label>
                  <input
                    id="alert_rate_limit_per_hour"
                    type="number"
                    min="1"
                    max="1000"
                    value={formValues.alert_rate_limit_per_hour}
                    onChange={(e) => handleChange('alert_rate_limit_per_hour', e.target.value)}
                    className={`${styles.input} ${validationErrors.alert_rate_limit_per_hour ? styles.inputError : ''}`}
                  />
                  {validationErrors.alert_rate_limit_per_hour && (
                    <span className={styles.fieldError}>{validationErrors.alert_rate_limit_per_hour}</span>
                  )}
                  <span className={styles.hint}>1-1,000 alerts per team per hour.</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={styles.saveButton}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default AdminSettings;
