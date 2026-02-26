import type { Dependency } from '../../../types/service';
import type { Association } from '../../../types/association';
import type { DependencyAlias } from '../../../types/alias';
import { parseContact, hasActiveOverride } from '../../../utils/dependency';
import StatusBadge from '../../common/StatusBadge';
import { LatencyChart, HealthTimeline } from '../../Charts';
import { ErrorHistoryPanel } from '../../common/ErrorHistoryPanel';
import { getHealthStateBadgeStatus } from '../../../utils/statusMapping';
import styles from './DependencyList.module.css';

interface DependencyRowProps {
  dep: Dependency;
  serviceId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  canEdit: boolean;
  associations: Association[];
  alias: DependencyAlias | undefined;
}

function DependencyRow({
  dep,
  serviceId,
  isExpanded,
  onToggleExpand,
  onEdit,
  canEdit,
  associations,
  alias,
}: DependencyRowProps) {
  const contact = parseContact(dep.effective_contact);
  const overrideActive = hasActiveOverride(dep);

  return (
    <div className={styles.depCard}>
      <div
        className={`${styles.rowHeader} ${isExpanded ? styles.rowHeaderExpanded : ''}`}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <div className={styles.nameCol}>
          <span className={styles.nameMain}>
            {dep.canonical_name || dep.name}
          </span>
          {dep.canonical_name && (
            <span className={styles.nameSub}>{dep.name}</span>
          )}
          <span className={styles.nameBadges}>
            {alias && !dep.canonical_name && (
              <span className={styles.aliasBadge} title={`Alias: ${dep.name} -> ${alias.canonical_name}`}>
                {alias.canonical_name}
              </span>
            )}
            {associations.length > 0 && (
              <span className={styles.assocCount} title={`${associations.length} association${associations.length !== 1 ? 's' : ''}`}>
                {associations.length} assoc
              </span>
            )}
          </span>
        </div>

        <div className={styles.descCol}>
          {dep.description || '-'}
        </div>

        <div className={styles.impactCol}>
          <span className={styles.impactText} title={dep.effective_impact || undefined}>
            {dep.effective_impact || '-'}
          </span>
          {overrideActive && dep.impact_override && (
            <span className={styles.overrideBadge} title="Instance override active">
              override
            </span>
          )}
        </div>

        <div className={styles.contactCol}>
          {contact ? (
            <ul className={styles.contactList}>
              {Object.entries(contact).map(([key, value]) => (
                <li key={key}>
                  <span className={styles.contactKey}>{key}:</span>{' '}
                  {String(value)}
                </li>
              ))}
            </ul>
          ) : (
            <span className={styles.muted}>-</span>
          )}
          {overrideActive && dep.contact_override && (
            <span className={styles.overrideBadge} title="Instance override active">
              override
            </span>
          )}
        </div>

        <div className={styles.statusCol}>
          <StatusBadge
            status={getHealthStateBadgeStatus(dep)}
            size="small"
            showLabel={true}
          />
        </div>

        <div className={styles.latencyCol}>
          {dep.latency_ms !== null ? `${Math.round(dep.latency_ms)}ms` : '-'}
        </div>

        <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <button
              className={styles.editButton}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit dependency"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.expandedContent}>
          <div className={styles.expandedSection}>
            <LatencyChart
              dependencyId={dep.id}
              storageKey={`latency-range-${serviceId}`}
            />
          </div>
          <div className={styles.expandedSection}>
            <HealthTimeline
              dependencyId={dep.id}
              storageKey={`timeline-range-${serviceId}`}
            />
          </div>
          <div className={styles.expandedSection}>
            <div className={styles.errorHistoryWrapper}>
              <ErrorHistoryPanel
                dependencyId={dep.id}
                dependencyName={dep.canonical_name || dep.name}
                onBack={onToggleExpand}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DependencyRow;
