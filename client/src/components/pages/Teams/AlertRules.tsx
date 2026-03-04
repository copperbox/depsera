import { useState, useEffect } from 'react';
import { useAlertRules } from '../../../hooks/useAlertRules';
import type { AlertSeverityFilter } from '../../../types/alert';
import styles from './Teams.module.css';
import alertStyles from './AlertRules.module.css';

interface AlertRulesProps {
  teamId: string;
  canManage: boolean;
}

const SEVERITY_LABELS: Record<AlertSeverityFilter, string> = {
  critical: 'Critical only',
  warning: 'Warning and above',
  all: 'All status changes',
};

function AlertRules({ teamId, canManage }: AlertRulesProps) {
  const {
    rules,
    isLoading,
    isSaving,
    error,
    saveSuccess,
    loadRules,
    handleSave,
    clearError,
    clearSaveSuccess,
  } = useAlertRules(teamId);

  const [severityFilter, setSeverityFilter] = useState<AlertSeverityFilter>('all');
  const [isActive, setIsActive] = useState(true);
  const [useCustomThresholds, setUseCustomThresholds] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState<string>('');
  const [rateLimitPerHour, setRateLimitPerHour] = useState<string>('');
  const [alertDelayMinutes, setAlertDelayMinutes] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Sync local state when rules load
  useEffect(() => {
    if (rules.length > 0) {
      const rule = rules[0];
      setSeverityFilter(rule.severity_filter);
      setIsActive(!!rule.is_active);
      setUseCustomThresholds(!!rule.use_custom_thresholds);
      setCooldownMinutes(rule.cooldown_minutes != null ? String(rule.cooldown_minutes) : '');
      setRateLimitPerHour(rule.rate_limit_per_hour != null ? String(rule.rate_limit_per_hour) : '');
      setAlertDelayMinutes(rule.alert_delay_minutes != null ? String(rule.alert_delay_minutes) : '');
      setHasChanges(false);
    }
  }, [rules]);

  // Auto-dismiss save success after 3 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(clearSaveSuccess, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess, clearSaveSuccess]);

  const markChanged = () => {
    setHasChanges(true);
    clearSaveSuccess();
  };

  const handleSeverityChange = (value: AlertSeverityFilter) => {
    setSeverityFilter(value);
    markChanged();
  };

  const handleToggleActive = () => {
    setIsActive((prev) => !prev);
    markChanged();
  };

  const handleToggleCustomThresholds = () => {
    setUseCustomThresholds((prev) => !prev);
    markChanged();
  };

  const handleCooldownChange = (value: string) => {
    setCooldownMinutes(value);
    markChanged();
  };

  const handleRateLimitChange = (value: string) => {
    setRateLimitPerHour(value);
    markChanged();
  };

  const handleAlertDelayChange = (value: string) => {
    setAlertDelayMinutes(value);
    markChanged();
  };

  const handleSubmit = async () => {
    const success = await handleSave({
      severity_filter: severityFilter,
      is_active: isActive,
      use_custom_thresholds: useCustomThresholds,
      cooldown_minutes: cooldownMinutes !== '' ? Number(cooldownMinutes) : null,
      rate_limit_per_hour: rateLimitPerHour !== '' ? Number(rateLimitPerHour) : null,
      alert_delay_minutes: alertDelayMinutes !== '' ? Number(alertDelayMinutes) : null,
    });
    if (success) {
      setHasChanges(false);
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Alert Rules</h2>
      </div>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          {error}
          <button onClick={clearError} className={alertStyles.dismissButton} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className={alertStyles.saveSuccess} style={{ marginBottom: '1rem' }}>
          Alert rules saved successfully
          <button onClick={clearSaveSuccess} className={alertStyles.dismissButton} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading} style={{ padding: '2rem' }}>
          <div className={styles.spinner} />
          <span>Loading rules...</span>
        </div>
      ) : canManage ? (
        <div className={alertStyles.rulesForm}>
          <div className={alertStyles.ruleRow}>
            <div className={alertStyles.ruleField}>
              <label className={alertStyles.ruleLabel}>Severity Filter</label>
              <select
                value={severityFilter}
                onChange={(e) => handleSeverityChange(e.target.value as AlertSeverityFilter)}
                className={alertStyles.ruleSelect}
                disabled={isSaving}
              >
                {(Object.entries(SEVERITY_LABELS) as [AlertSeverityFilter, string][]).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className={alertStyles.ruleField}>
              <label className={alertStyles.ruleLabel}>Alerting</label>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={isSaving}
                className={`${alertStyles.toggleButton} ${isActive ? alertStyles.toggleActive : alertStyles.toggleInactive}`}
                role="switch"
                aria-checked={isActive}
              >
                <span className={alertStyles.toggleTrack}>
                  <span className={alertStyles.toggleThumb} />
                </span>
                <span className={alertStyles.toggleLabel}>
                  {isActive ? 'Enabled' : 'Disabled'}
                </span>
              </button>
            </div>
          </div>

          <div className={alertStyles.thresholdsSection}>
            <label className={alertStyles.checkboxLabel}>
              <input
                type="checkbox"
                checked={useCustomThresholds}
                onChange={handleToggleCustomThresholds}
                disabled={isSaving}
                className={alertStyles.checkbox}
              />
              <span>Override global defaults</span>
            </label>

            <div className={alertStyles.thresholdsRow}>
              <div className={alertStyles.ruleField}>
                <label className={alertStyles.ruleLabel}>Alert cooldown (minutes)</label>
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => handleCooldownChange(e.target.value)}
                  disabled={isSaving || !useCustomThresholds}
                  className={alertStyles.ruleInput}
                  min={0}
                  max={1440}
                  placeholder="0-1440"
                />
              </div>

              <div className={alertStyles.ruleField}>
                <label className={alertStyles.ruleLabel}>Max alerts per hour</label>
                <input
                  type="number"
                  value={rateLimitPerHour}
                  onChange={(e) => handleRateLimitChange(e.target.value)}
                  disabled={isSaving || !useCustomThresholds}
                  className={alertStyles.ruleInput}
                  min={1}
                  max={1000}
                  placeholder="1-1000"
                />
              </div>
            </div>
          </div>

          <div className={alertStyles.delaySection}>
            <div className={alertStyles.ruleField}>
              <label className={alertStyles.ruleLabel}>Alert delay (minutes)</label>
              <input
                type="number"
                value={alertDelayMinutes}
                onChange={(e) => handleAlertDelayChange(e.target.value)}
                disabled={isSaving || !isActive}
                className={alertStyles.ruleInput}
                min={1}
                max={60}
                placeholder="1-60"
              />
              <span className={alertStyles.helperText}>
                Dependency must be continuously unhealthy for this duration before alerting. Leave empty to alert immediately.
              </span>
            </div>
          </div>

          <div className={alertStyles.ruleActions}>
            <button
              onClick={handleSubmit}
              disabled={isSaving || !hasChanges}
              className={alertStyles.saveButton}
            >
              {isSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
        </div>
      ) : (
        <div className={alertStyles.rulesReadonly}>
          {rules.length > 0 ? (
            <>
              <div className={alertStyles.rulesSummary}>
                <span className={alertStyles.rulesSummaryLabel}>Severity:</span>
                <span className={alertStyles.rulesSummaryValue}>
                  {SEVERITY_LABELS[rules[0].severity_filter]}
                </span>
                <span
                  className={`${alertStyles.rulesStatusBadge} ${
                    rules[0].is_active ? alertStyles.rulesStatusActive : alertStyles.rulesStatusInactive
                  }`}
                >
                  {rules[0].is_active ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {!!rules[0].use_custom_thresholds && (
                <div className={alertStyles.rulesSummary} style={{ marginTop: '0.5rem' }}>
                  {rules[0].cooldown_minutes != null && (
                    <>
                      <span className={alertStyles.rulesSummaryLabel}>Cooldown:</span>
                      <span className={alertStyles.rulesSummaryValue}>
                        {rules[0].cooldown_minutes} min
                      </span>
                    </>
                  )}
                  {rules[0].rate_limit_per_hour != null && (
                    <>
                      <span className={alertStyles.rulesSummaryLabel} style={{ marginLeft: rules[0].cooldown_minutes != null ? '1rem' : undefined }}>
                        Max/hour:
                      </span>
                      <span className={alertStyles.rulesSummaryValue}>
                        {rules[0].rate_limit_per_hour}
                      </span>
                    </>
                  )}
                </div>
              )}
              {rules[0].alert_delay_minutes != null && (
                <div className={alertStyles.rulesSummary} style={{ marginTop: '0.5rem' }}>
                  <span className={alertStyles.rulesSummaryLabel}>Alert after:</span>
                  <span className={alertStyles.rulesSummaryValue}>
                    {rules[0].alert_delay_minutes} min
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noItems}>
              <p>No alert rules configured for this team.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertRules;
