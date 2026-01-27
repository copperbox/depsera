import type { Scenario, ActiveFailure } from '../../types';
import { ScenarioButton } from '../ScenarioButton';
import { FailureItem } from '../FailureItem';
import styles from './Sidebar.module.css';

interface SidebarProps {
  scenarios: Scenario[];
  failures: ActiveFailure[];
  onApplyScenario: (name: string) => Promise<void>;
  onClearFailure: (serviceId: string) => Promise<void>;
}

export function Sidebar({
  scenarios,
  failures,
  onApplyScenario,
  onClearFailure,
}: SidebarProps) {
  // Filter out cascaded failures - only show directly injected ones
  const directFailures = failures.filter(f => !f.state.isCascaded);

  return (
    <aside className={styles.sidebar}>
      <section className={styles.section}>
        <h2 className={styles.title}>Predefined Scenarios</h2>
        <div className={styles.scenarioList}>
          {scenarios.map(scenario => (
            <ScenarioButton
              key={scenario.name}
              scenario={scenario}
              onClick={() => onApplyScenario(scenario.name)}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Active Failures</h2>
        <div className={styles.failureList}>
          {directFailures.length === 0 ? (
            <div className={styles.emptyState}>No active failures</div>
          ) : (
            directFailures.map(failure => (
              <FailureItem
                key={failure.serviceId}
                failure={failure}
                onClear={() => onClearFailure(failure.serviceId)}
              />
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
