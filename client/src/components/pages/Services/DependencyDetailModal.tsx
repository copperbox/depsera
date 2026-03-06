import { Pencil } from 'lucide-react';
import type { Dependency } from '../../../types/service';
import { parseContact, hasActiveOverride } from '../../../utils/dependency';
import { getHealthStateBadgeStatus } from '../../../utils/statusMapping';
import { formatRelativeTime } from '../../../utils/formatting';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import { LatencyChart } from '../../Charts';
import styles from './DependencyDetailModal.module.css';

interface DependencyDetailModalProps {
  dep: Dependency | null;
  serviceName: string;
  serviceId: string;
  onClose: () => void;
  onEdit?: () => void;
}

function DependencyDetailModal({
  dep,
  serviceName,
  serviceId,
  onClose,
  onEdit,
}: DependencyDetailModalProps) {
  if (!dep) return null;

  const displayName = dep.canonical_name || dep.name;
  const contact = parseContact(dep.effective_contact);
  const overrideActive = hasActiveOverride(dep);

  return (
    <Modal
      isOpen={dep !== null}
      onClose={onClose}
      title={displayName}
      size="md"
    >
      {/* Header with status */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.targetService}>
            Dependency of {serviceName}
          </div>
        </div>
        <StatusBadge
          status={getHealthStateBadgeStatus(dep)}
          size="small"
          showLabel={true}
        />
      </div>

      {/* Metadata */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Details</h3>
        <div className={styles.metadataGrid}>
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Name</span>
            <span className={styles.metadataValue}>{dep.name}</span>
          </div>
          {dep.canonical_name && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Canonical Name</span>
              <span className={styles.metadataValue}>{dep.canonical_name}</span>
            </div>
          )}
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Latency</span>
            <span className={styles.metadataValue}>
              {dep.latency_ms !== null ? `${Math.round(dep.latency_ms)}ms` : '-'}
            </span>
          </div>
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Last Checked</span>
            <span className={styles.metadataValue}>
              {dep.last_checked ? formatRelativeTime(dep.last_checked) : '-'}
            </span>
          </div>
          {dep.description && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Description</span>
              <span className={styles.metadataValue}>{dep.description}</span>
            </div>
          )}
          {dep.effective_impact && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>
                Impact
                {overrideActive && dep.impact_override && (
                  <span className={styles.overrideBadge}>override</span>
                )}
              </span>
              <span className={styles.metadataValue}>{dep.effective_impact}</span>
            </div>
          )}
        </div>
      </div>

      {/* Latency Chart */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Latency</h3>
        <div className={styles.chartContainer}>
          <LatencyChart
            dependencyId={dep.id}
            storageKey={`detail-latency-range-${serviceId}`}
          />
        </div>
      </div>

      {/* Contact Info */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Contact
          {overrideActive && dep.contact_override && (
            <span className={styles.overrideBadge}>override</span>
          )}
        </h3>
        {contact ? (
          <ul className={styles.contactList}>
            {Object.entries(contact).map(([key, value]) => (
              <li key={key} className={styles.contactItem}>
                <span className={styles.contactKey}>{key}</span>
                <span className={styles.contactValue}>{String(value)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className={styles.emptyText}>No contact information available.</span>
        )}
      </div>

      {/* Edit action for lead/admin */}
      {onEdit && (
        <div className={styles.editAction}>
          <button
            type="button"
            className={styles.editButton}
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            <Pencil size={14} />
            Edit Overrides
          </button>
        </div>
      )}
    </Modal>
  );
}

export default DependencyDetailModal;
