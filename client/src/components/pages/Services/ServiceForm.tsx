import { useState, useCallback, FormEvent } from 'react';
import { createService, updateService } from '../../../api/services';
import type {
  ServiceWithDependencies,
  TeamWithCounts,
  CreateServiceInput,
  UpdateServiceInput,
  SchemaMapping,
} from '../../../types/service';
import SchemaConfigEditor from './SchemaConfigEditor';
import styles from './ServiceForm.module.css';

interface ServiceFormProps {
  teams: TeamWithCounts[];
  service?: ServiceWithDependencies;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string;
  schema_config?: string;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseSchemaConfig(raw: string | null): SchemaMapping | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchemaMapping;
  } catch {
    return null;
  }
}

function ServiceForm({ teams, service, onSuccess, onCancel }: ServiceFormProps) {
  const isEdit = !!service;

  const [formData, setFormData] = useState({
    name: service?.name ?? '',
    team_id: service?.team_id ?? '',
    health_endpoint: service?.health_endpoint ?? '',
    metrics_endpoint: service?.metrics_endpoint ?? '',
    is_active: service?.is_active === 1,
  });
  const [schemaConfig, setSchemaConfig] = useState<SchemaMapping | null>(
    parseSchemaConfig(service?.schema_config ?? null)
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSchemaChange = useCallback((value: SchemaMapping | null) => {
    setSchemaConfig(value);
    setErrors((prev) => ({ ...prev, schema_config: undefined }));
  }, []);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.team_id) {
      newErrors.team_id = 'Team is required';
    }

    if (!formData.health_endpoint.trim()) {
      newErrors.health_endpoint = 'Health endpoint is required';
    } else if (!isValidUrl(formData.health_endpoint)) {
      newErrors.health_endpoint = 'Must be a valid HTTP or HTTPS URL';
    }

    if (formData.metrics_endpoint && !isValidUrl(formData.metrics_endpoint)) {
      newErrors.metrics_endpoint = 'Must be a valid HTTP or HTTPS URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const schemaConfigJson = schemaConfig ? JSON.stringify(schemaConfig) : null;

      if (isEdit && service) {
        const updateData: UpdateServiceInput = {
          name: formData.name,
          team_id: formData.team_id,
          health_endpoint: formData.health_endpoint,
          metrics_endpoint: formData.metrics_endpoint || undefined,
          is_active: formData.is_active,
          schema_config: schemaConfigJson,
        };
        await updateService(service.id, updateData);
      } else {
        const createData: CreateServiceInput = {
          name: formData.name,
          team_id: formData.team_id,
          health_endpoint: formData.health_endpoint,
          metrics_endpoint: formData.metrics_endpoint || undefined,
          schema_config: schemaConfigJson,
        };
        await createService(createData);
      }
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {submitError && <div className={styles.error}>{submitError}</div>}

      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          Name <span className={styles.required}>*</span>
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
          placeholder="e.g., User Service"
          disabled={isSubmitting}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <span id="name-error" className={styles.fieldError}>
            {errors.name}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="team_id" className={styles.label}>
          Team <span className={styles.required}>*</span>
        </label>
        <select
          id="team_id"
          value={formData.team_id}
          onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
          className={`${styles.select} ${errors.team_id ? styles.inputError : ''}`}
          disabled={isSubmitting}
          aria-describedby={errors.team_id ? 'team-error' : undefined}
        >
          <option value="">Select a team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        {errors.team_id && (
          <span id="team-error" className={styles.fieldError}>
            {errors.team_id}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="health_endpoint" className={styles.label}>
          Health Endpoint <span className={styles.required}>*</span>
        </label>
        <input
          id="health_endpoint"
          type="url"
          value={formData.health_endpoint}
          onChange={(e) => setFormData({ ...formData, health_endpoint: e.target.value })}
          className={`${styles.input} ${errors.health_endpoint ? styles.inputError : ''}`}
          placeholder="https://example.com/dependencies"
          disabled={isSubmitting}
          aria-describedby={errors.health_endpoint ? 'health-endpoint-error' : undefined}
        />
        {errors.health_endpoint && (
          <span id="health-endpoint-error" className={styles.fieldError}>
            {errors.health_endpoint}
          </span>
        )}
        <span className={styles.hint}>URL that returns dependency health status</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="metrics_endpoint" className={styles.label}>
          Metrics Endpoint
        </label>
        <input
          id="metrics_endpoint"
          type="url"
          value={formData.metrics_endpoint}
          onChange={(e) => setFormData({ ...formData, metrics_endpoint: e.target.value })}
          className={`${styles.input} ${errors.metrics_endpoint ? styles.inputError : ''}`}
          placeholder="https://example.com/metrics"
          disabled={isSubmitting}
          aria-describedby={errors.metrics_endpoint ? 'metrics-endpoint-error' : undefined}
        />
        {errors.metrics_endpoint && (
          <span id="metrics-endpoint-error" className={styles.fieldError}>
            {errors.metrics_endpoint}
          </span>
        )}
        <span className={styles.hint}>Optional URL for metrics data</span>
      </div>

      <SchemaConfigEditor
        value={schemaConfig}
        onChange={handleSchemaChange}
        healthEndpoint={formData.health_endpoint}
        disabled={isSubmitting}
      />

      {isEdit && (
        <div className={styles.checkboxField}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className={styles.checkbox}
              disabled={isSubmitting}
            />
            <span>Service is active</span>
          </label>
          <span className={styles.hint}>Inactive services are not polled</span>
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          onClick={onCancel}
          className={styles.cancelButton}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Service'}
        </button>
      </div>
    </form>
  );
}

export default ServiceForm;
