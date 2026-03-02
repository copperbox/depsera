import { useState, useRef, FormEvent } from 'react';
import { createTeam, updateTeam } from '../../../api/teams';
import { parseContact } from '../../../utils/dependency';
import type { TeamWithDetails, CreateTeamInput, UpdateTeamInput } from '../../../types/team';
import styles from './TeamForm.module.css';

interface ContactEntry {
  key: string;
  value: string;
}

interface TeamFormProps {
  team?: TeamWithDetails;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  key?: string;
}

function deriveKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function TeamForm({ team, onSuccess, onCancel }: TeamFormProps) {
  const isEdit = !!team;

  const [formData, setFormData] = useState({
    name: team?.name ?? '',
    key: team?.key ?? '',
    description: team?.description ?? '',
  });
  const keyTouched = useRef(isEdit);
  const [contactEntries, setContactEntries] = useState<ContactEntry[]>(() => {
    const existing = parseContact(team?.contact ?? null);
    return existing
      ? Object.entries(existing).map(([key, value]) => ({ key, value: String(value) }))
      : [];
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    const keyVal = formData.key.trim();
    if (!keyVal) {
      newErrors.key = 'Key is required';
    } else if (!KEY_PATTERN.test(keyVal)) {
      newErrors.key = 'Key must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores';
    } else if (keyVal.length > 128) {
      newErrors.key = 'Key must be 128 characters or fewer';
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
      const validEntries = contactEntries.filter(e => e.key.trim());
      const contactJson = validEntries.length > 0
        ? JSON.stringify(Object.fromEntries(validEntries.map(e => [e.key.trim(), e.value])))
        : undefined;

      if (isEdit && team) {
        const updateData: UpdateTeamInput = {
          name: formData.name,
          key: formData.key,
          description: formData.description || undefined,
          contact: contactJson,
        };
        await updateTeam(team.id, updateData);
      } else {
        const createData: CreateTeamInput = {
          name: formData.name,
          key: formData.key,
          description: formData.description || undefined,
          contact: contactJson,
        };
        await createTeam(createData);
      }
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNameChange = (value: string) => {
    const next = { ...formData, name: value };
    if (!keyTouched.current) {
      next.key = deriveKey(value);
    }
    setFormData(next);
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
          onChange={(e) => handleNameChange(e.target.value)}
          className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
          placeholder="e.g., Platform Team"
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
        <label htmlFor="key" className={styles.label}>
          Key <span className={styles.required}>*</span>
        </label>
        <input
          id="key"
          type="text"
          value={formData.key}
          onChange={(e) => {
            keyTouched.current = true;
            setFormData({ ...formData, key: e.target.value });
          }}
          className={`${styles.input} ${styles.keyInput} ${errors.key ? styles.inputError : ''}`}
          placeholder="e.g., platform-team"
          disabled={isSubmitting}
          aria-describedby={errors.key ? 'key-error' : 'key-hint'}
        />
        {errors.key ? (
          <span id="key-error" className={styles.fieldError}>
            {errors.key}
          </span>
        ) : (
          <span id="key-hint" className={styles.hint}>
            Lowercase letters, numbers, hyphens, and underscores. Used in manifest references.
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="description" className={styles.label}>
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className={styles.textarea}
          placeholder="Brief description of the team's responsibilities"
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Contact</label>
        {contactEntries.map((entry, index) => (
          <div key={index} className={styles.contactEntryRow}>
            <input
              type="text"
              className={styles.contactKeyInput}
              value={entry.key}
              onChange={(e) => {
                const next = [...contactEntries];
                next[index] = { ...next[index], key: e.target.value };
                setContactEntries(next);
              }}
              placeholder="Key (e.g. email)"
              disabled={isSubmitting}
            />
            <input
              type="text"
              className={styles.contactValueInput}
              value={entry.value}
              onChange={(e) => {
                const next = [...contactEntries];
                next[index] = { ...next[index], value: e.target.value };
                setContactEntries(next);
              }}
              placeholder="Value"
              disabled={isSubmitting}
            />
            <button
              type="button"
              className={styles.contactRemoveButton}
              onClick={() => setContactEntries(contactEntries.filter((_, i) => i !== index))}
              disabled={isSubmitting}
              title="Remove entry"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.addFieldButton}
          onClick={() => setContactEntries([...contactEntries, { key: '', value: '' }])}
          disabled={isSubmitting}
        >
          + Add Field
        </button>
      </div>

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
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Team'}
        </button>
      </div>
    </form>
  );
}

export default TeamForm;
