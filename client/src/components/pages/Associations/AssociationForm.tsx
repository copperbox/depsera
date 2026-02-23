import { useState, useEffect } from 'react';
import { fetchServices } from '../../../api/services';
import { fetchExternalServices } from '../../../api/external-services';
import { createAssociation } from '../../../api/associations';
import type { ServiceWithDependencies } from '../../../types/service';
import type { ExternalService } from '../../../types/external-service';
import type { AssociationType, CreateAssociationInput } from '../../../types/association';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import SearchableSelect from '../../common/SearchableSelect';
import type { SelectOption } from '../../common/SearchableSelect';
import styles from './AssociationForm.module.css';

interface AssociationFormProps {
  dependencyId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function AssociationForm({ dependencyId, onSuccess, onCancel }: AssociationFormProps) {
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const [externalServices, setExternalServices] = useState<ExternalService[]>([]);
  const [selectedDependencyId, setSelectedDependencyId] = useState(dependencyId || '');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [associationType, setAssociationType] = useState<AssociationType>('api_call');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [data, extData] = await Promise.all([
          fetchServices(),
          fetchExternalServices(),
        ]);
        setServices(data);
        setExternalServices(extData);
      } catch {
        setError('Failed to load services');
      } finally {
        setIsLoadingServices(false);
      }
    };
    load();
  }, []);

  const dependencyOptions: SelectOption[] = services.flatMap((svc) =>
    svc.dependencies.map((dep) => ({
      value: dep.id,
      label: dep.name,
      group: svc.name,
    })),
  );

  const serviceOptions: SelectOption[] = [
    ...services.map((svc) => ({
      value: svc.id,
      label: svc.name,
      group: svc.team.name,
    })),
    ...externalServices.map((svc) => ({
      value: svc.id,
      label: svc.name,
      group: `${svc.team.name} (External)`,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDependencyId || !selectedServiceId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const input: CreateAssociationInput = {
        linked_service_id: selectedServiceId,
        association_type: associationType,
      };
      await createAssociation(selectedDependencyId, input);
      setSelectedServiceId('');
      if (!dependencyId) setSelectedDependencyId('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create association');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingServices) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}

      {!dependencyId && (
        <SearchableSelect
          label="Dependency"
          options={dependencyOptions}
          value={selectedDependencyId}
          onChange={setSelectedDependencyId}
          placeholder="Select dependency..."
          id="assoc-dependency"
        />
      )}

      <SearchableSelect
        label="Target Service"
        options={serviceOptions}
        value={selectedServiceId}
        onChange={setSelectedServiceId}
        placeholder="Select service..."
        id="assoc-service"
      />

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="assoc-type">
          Association Type
        </label>
        <select
          id="assoc-type"
          className={styles.select}
          value={associationType}
          onChange={(e) => setAssociationType(e.target.value as AssociationType)}
        >
          {Object.entries(ASSOCIATION_TYPE_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className={styles.submitButton}
          disabled={isSubmitting || !selectedDependencyId || !selectedServiceId}
        >
          {isSubmitting ? 'Creating...' : 'Create Association'}
        </button>
      </div>
    </form>
  );
}

export default AssociationForm;
