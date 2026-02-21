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
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Sync local state when rules load
  useEffect(() => {
    if (rules.length > 0) {
      setSeverityFilter(rules[0].severity_filter);
      setIsActive(!!rules[0].is_active);
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

  const handleSeverityChange = (value: AlertSeverityFilter) => {
    setSeverityFilter(value);
    setHasChanges(true);
    clearSaveSuccess();
  };

  const handleToggleActive = () => {
    setIsActive((prev) => !prev);
    setHasChanges(true);
    clearSaveSuccess();
  };

  const handleSubmit = async () => {
    const success = await handleSave({
      severity_filter: severityFilter,
      is_active: isActive,
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
