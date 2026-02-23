import { useState, useCallback } from 'react';
import { testSchemaMapping } from '../../../api/services';
import type {
  SchemaMapping,
  FieldMapping,
  BooleanComparison,
  TestSchemaResult,
} from '../../../types/service';
import styles from './SchemaConfigEditor.module.css';

type SchemaMode = 'default' | 'custom';

interface SchemaConfigEditorProps {
  value: SchemaMapping | null;
  onChange: (value: SchemaMapping | null) => void;
  healthEndpoint: string;
  disabled?: boolean;
}

interface GuidedFormState {
  root: string;
  nameField: string;
  useKeyAsName: boolean;
  healthyField: string;
  healthyEquals: string;
  latencyField: string;
  impactField: string;
  descriptionField: string;
  typeField: string;
  checkDetailsField: string;
}

interface FormErrors {
  root?: string;
  nameField?: string;
  healthyField?: string;
  json?: string;
}

function isBooleanComparison(fm: FieldMapping): fm is BooleanComparison {
  return typeof fm === 'object' && fm !== null && 'field' in fm && 'equals' in fm;
}

function schemaMappingToFormState(mapping: SchemaMapping): GuidedFormState {
  const isKeyName = typeof mapping.fields.name === 'string' && mapping.fields.name === '$key';
  return {
    root: mapping.root,
    nameField: isKeyName ? '' : (typeof mapping.fields.name === 'string' ? mapping.fields.name : mapping.fields.name.field),
    useKeyAsName: isKeyName,
    healthyField: isBooleanComparison(mapping.fields.healthy) ? mapping.fields.healthy.field : (typeof mapping.fields.healthy === 'string' ? mapping.fields.healthy : ''),
    healthyEquals: isBooleanComparison(mapping.fields.healthy) ? mapping.fields.healthy.equals : '',
    latencyField: mapping.fields.latency ? (typeof mapping.fields.latency === 'string' ? mapping.fields.latency : mapping.fields.latency.field) : '',
    impactField: mapping.fields.impact ? (typeof mapping.fields.impact === 'string' ? mapping.fields.impact : mapping.fields.impact.field) : '',
    descriptionField: mapping.fields.description ? (typeof mapping.fields.description === 'string' ? mapping.fields.description : mapping.fields.description.field) : '',
    typeField: mapping.fields.type ? (typeof mapping.fields.type === 'string' ? mapping.fields.type : mapping.fields.type.field) : '',
    checkDetailsField: mapping.fields.checkDetails || '',
  };
}

function formStateToSchemaMapping(state: GuidedFormState): SchemaMapping {
  const healthy: FieldMapping = state.healthyEquals.trim()
    ? { field: state.healthyField, equals: state.healthyEquals }
    : state.healthyField;

  const mapping: SchemaMapping = {
    root: state.root,
    fields: {
      name: state.useKeyAsName ? '$key' : state.nameField,
      healthy,
    },
  };

  if (state.latencyField.trim()) {
    mapping.fields.latency = state.latencyField;
  }
  if (state.impactField.trim()) {
    mapping.fields.impact = state.impactField;
  }
  if (state.descriptionField.trim()) {
    mapping.fields.description = state.descriptionField;
  }
  if (state.typeField.trim()) {
    mapping.fields.type = state.typeField;
  }
  if (state.checkDetailsField.trim()) {
    mapping.fields.checkDetails = state.checkDetailsField;
  }

  return mapping;
}

const emptyFormState: GuidedFormState = {
  root: '',
  nameField: '',
  useKeyAsName: false,
  healthyField: '',
  healthyEquals: '',
  latencyField: '',
  impactField: '',
  descriptionField: '',
  typeField: '',
  checkDetailsField: '',
};

function SchemaConfigEditor({ value, onChange, healthEndpoint, disabled }: SchemaConfigEditorProps) {
  const [mode, setMode] = useState<SchemaMode>(value ? 'custom' : 'default');
  const [formState, setFormState] = useState<GuidedFormState>(
    value ? schemaMappingToFormState(value) : emptyFormState
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState(value ? JSON.stringify(value, null, 2) : '');
  const [testResult, setTestResult] = useState<TestSchemaResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const updateFromGuided = useCallback((newState: GuidedFormState) => {
    setFormState(newState);
    const hasName = newState.useKeyAsName || newState.nameField.trim();
    if (newState.root.trim() && hasName && newState.healthyField.trim()) {
      const mapping = formStateToSchemaMapping(newState);
      onChange(mapping);
      setJsonText(JSON.stringify(mapping, null, 2));
    }
  }, [onChange]);

  const handleModeChange = useCallback((newMode: SchemaMode) => {
    setMode(newMode);
    setErrors({});
    setTestResult(null);
    setTestError(null);
    if (newMode === 'default') {
      onChange(null);
      setFormState(emptyFormState);
      setJsonText('');
    }
  }, [onChange]);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    setErrors((prev) => ({ ...prev, json: undefined }));
    try {
      const parsed = JSON.parse(text);
      if (parsed.root && parsed.fields?.name && parsed.fields?.healthy) {
        onChange(parsed as SchemaMapping);
        setFormState(schemaMappingToFormState(parsed as SchemaMapping));
      } else {
        setErrors((prev) => ({ ...prev, json: 'Missing required fields: root, fields.name, fields.healthy' }));
      }
    } catch {
      if (text.trim()) {
        setErrors((prev) => ({ ...prev, json: 'Invalid JSON' }));
      }
    }
  }, [onChange]);

  const validateForTest = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formState.root.trim()) newErrors.root = 'Required';
    if (!formState.useKeyAsName && !formState.nameField.trim()) newErrors.nameField = 'Required';
    if (!formState.healthyField.trim()) newErrors.healthyField = 'Required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTest = async () => {
    if (!validateForTest()) return;
    if (!healthEndpoint) {
      setTestError('Enter a health endpoint URL first');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const mapping = showAdvanced
        ? JSON.parse(jsonText) as SchemaMapping
        : formStateToSchemaMapping(formState);
      const result = await testSchemaMapping(healthEndpoint, mapping);
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleFieldChange = (field: keyof GuidedFormState, val: string) => {
    const newState = { ...formState, [field]: val };
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    updateFromGuided(newState);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Health Endpoint Format</span>
        <div className={styles.formatToggle}>
          <button
            type="button"
            className={`${styles.formatOption} ${mode === 'default' ? styles.formatOptionActive : ''}`}
            onClick={() => handleModeChange('default')}
            disabled={disabled}
          >
            proactive-deps (default)
          </button>
          <button
            type="button"
            className={`${styles.formatOption} ${mode === 'custom' ? styles.formatOptionActive : ''}`}
            onClick={() => handleModeChange('custom')}
            disabled={disabled}
          >
            Custom schema
          </button>
        </div>
      </div>

      {mode === 'custom' && (
        <>
          {!showAdvanced && (
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="schema-root" className={styles.label}>
                  Path to dependencies <span className={styles.required}>*</span>
                </label>
                <input
                  id="schema-root"
                  type="text"
                  value={formState.root}
                  onChange={(e) => handleFieldChange('root', e.target.value)}
                  className={`${styles.input} ${errors.root ? styles.inputError : ''}`}
                  placeholder="data.healthChecks"
                  disabled={disabled}
                />
                {errors.root && <span className={styles.fieldError}>{errors.root}</span>}
                <span className={styles.hint}>Dot-notation path to the array or object with named keys</span>
              </div>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formState.useKeyAsName}
                  onChange={(e) => {
                    const newState = { ...formState, useKeyAsName: e.target.checked };
                    if (e.target.checked) {
                      newState.nameField = '';
                    }
                    setErrors((prev) => ({ ...prev, nameField: undefined }));
                    updateFromGuided(newState);
                  }}
                  disabled={disabled}
                />
                Use object keys as dependency names
                <span className={styles.hint}>Enable when the root path resolves to an object (e.g., Spring Boot Actuator, ASP.NET Health Checks)</span>
              </label>

              <div className={styles.divider} />

              <div className={styles.fieldRow}>
                {!formState.useKeyAsName && (
                <div className={styles.field}>
                  <label htmlFor="schema-name" className={styles.label}>
                    Name field <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="schema-name"
                    type="text"
                    value={formState.nameField}
                    onChange={(e) => handleFieldChange('nameField', e.target.value)}
                    className={`${styles.input} ${errors.nameField ? styles.inputError : ''}`}
                    placeholder="checkName"
                    disabled={disabled}
                  />
                  {errors.nameField && <span className={styles.fieldError}>{errors.nameField}</span>}
                </div>
                )}
                <div className={styles.field}>
                  <label htmlFor="schema-description" className={styles.label}>
                    Description field
                  </label>
                  <input
                    id="schema-description"
                    type="text"
                    value={formState.descriptionField}
                    onChange={(e) => handleFieldChange('descriptionField', e.target.value)}
                    className={styles.input}
                    placeholder="displayName"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className={styles.healthyRow}>
                <div className={styles.field}>
                  <label htmlFor="schema-healthy" className={styles.label}>
                    Healthy field <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="schema-healthy"
                    type="text"
                    value={formState.healthyField}
                    onChange={(e) => handleFieldChange('healthyField', e.target.value)}
                    className={`${styles.input} ${errors.healthyField ? styles.inputError : ''}`}
                    placeholder="status"
                    disabled={disabled}
                  />
                  {errors.healthyField && <span className={styles.fieldError}>{errors.healthyField}</span>}
                </div>
                <div className={styles.field}>
                  <label htmlFor="schema-healthy-equals" className={styles.label}>
                    Healthy equals value
                  </label>
                  <input
                    id="schema-healthy-equals"
                    type="text"
                    value={formState.healthyEquals}
                    onChange={(e) => handleFieldChange('healthyEquals', e.target.value)}
                    className={styles.input}
                    placeholder="UP"
                    disabled={disabled}
                  />
                  <span className={styles.hint}>If set, compares field value instead of treating as boolean</span>
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="schema-latency" className={styles.label}>
                    Latency field
                  </label>
                  <input
                    id="schema-latency"
                    type="text"
                    value={formState.latencyField}
                    onChange={(e) => handleFieldChange('latencyField', e.target.value)}
                    className={styles.input}
                    placeholder="responseTimeMs"
                    disabled={disabled}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="schema-impact" className={styles.label}>
                    Impact field
                  </label>
                  <input
                    id="schema-impact"
                    type="text"
                    value={formState.impactField}
                    onChange={(e) => handleFieldChange('impactField', e.target.value)}
                    className={styles.input}
                    placeholder="severity"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="schema-type" className={styles.label}>
                    Type field
                  </label>
                  <input
                    id="schema-type"
                    type="text"
                    value={formState.typeField}
                    onChange={(e) => handleFieldChange('typeField', e.target.value)}
                    className={styles.input}
                    placeholder="type"
                    disabled={disabled}
                  />
                  <span className={styles.hint}>Valid values: database, rest, soap, grpc, graphql, message_queue, cache, file_system, smtp, other</span>
                </div>
                <div className={styles.field}>
                  <label htmlFor="schema-checkDetails" className={styles.label}>
                    Check details field
                  </label>
                  <input
                    id="schema-checkDetails"
                    type="text"
                    value={formState.checkDetailsField}
                    onChange={(e) => handleFieldChange('checkDetailsField', e.target.value)}
                    className={styles.input}
                    placeholder="details"
                    disabled={disabled}
                  />
                  <span className={styles.hint}>Path to an arbitrary metadata object (e.g., database version, validation query details)</span>
                </div>
              </div>
            </div>
          )}

          {showAdvanced && (
            <div className={styles.field}>
              <label htmlFor="schema-json" className={styles.label}>Raw JSON</label>
              <textarea
                id="schema-json"
                className={styles.jsonEditor}
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                disabled={disabled}
                spellCheck={false}
              />
              {errors.json && <span className={styles.jsonError}>{errors.json}</span>}
            </div>
          )}

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.testButton}
              onClick={handleTest}
              disabled={disabled || isTesting || !healthEndpoint}
              title={!healthEndpoint ? 'Enter a health endpoint URL first' : undefined}
            >
              {isTesting ? 'Testing...' : 'Test mapping'}
            </button>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => {
                if (!showAdvanced) {
                  // Sync JSON from guided form before switching
                  const hasName = formState.useKeyAsName || formState.nameField.trim();
                  if (formState.root.trim() && hasName && formState.healthyField.trim()) {
                    setJsonText(JSON.stringify(formStateToSchemaMapping(formState), null, 2));
                  }
                }
                setShowAdvanced(!showAdvanced);
              }}
              disabled={disabled}
            >
              {showAdvanced ? 'Guided form' : 'Advanced (JSON)'}
            </button>
          </div>

          {isTesting && <span className={styles.testLoading}>Fetching and parsing health endpoint...</span>}
          {testError && <span className={styles.testError}>{testError}</span>}

          {testResult && (
            <div className={styles.previewSection}>
              <span className={styles.previewTitle}>
                Preview {testResult.success ? `(${testResult.dependencies.length} dependencies)` : '(failed)'}
              </span>

              {testResult.dependencies.length > 0 && (
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Healthy</th>
                      <th>Latency</th>
                      <th>Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResult.dependencies.map((dep) => (
                      <tr key={dep.name}>
                        <td>{dep.name}</td>
                        <td>
                          <span className={`${styles.healthyBadge} ${dep.healthy ? styles.healthyTrue : styles.healthyFalse}`}>
                            {dep.healthy ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>{dep.latency_ms != null ? `${dep.latency_ms}ms` : '-'}</td>
                        <td>{dep.impact ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {testResult.warnings.length > 0 && (
                <div className={styles.warnings}>
                  {testResult.warnings.map((w, i) => (
                    <span key={i} className={styles.warning}>{w}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SchemaConfigEditor;
