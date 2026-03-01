import { useState, FormEvent } from 'react';
import { createTeam, updateTeam } from '../../../api/teams';
import type { TeamWithDetails, CreateTeamInput, UpdateTeamInput } from '../../../types/team';
import styles from './TeamForm.module.css';

interface TeamFormProps {
  team?: TeamWithDetails;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
}

function TeamForm({ team, onSuccess, onCancel }: TeamFormProps) {
  const isEdit = !!team;

  const [formData, setFormData] = useState({
    name: team?.name ?? '',
    description: team?.description ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
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
      if (isEdit && team) {
        const updateData: UpdateTeamInput = {
          name: formData.name,
          description: formData.description || undefined,
        };
        await updateTeam(team.id, updateData);
      } else {
        const createData: CreateTeamInput = {
          name: formData.name,
          key: formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          description: formData.description || undefined,
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
