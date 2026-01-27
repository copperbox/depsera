import type { Scenario } from '../../types';
import styles from './ScenarioButton.module.css';

interface ScenarioButtonProps {
  scenario: Scenario;
  onClick: () => void;
  disabled?: boolean;
}

export function ScenarioButton({ scenario, onClick, disabled }: ScenarioButtonProps) {
  const displayName = scenario.name.replace(/-/g, ' ');

  return (
    <button
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
    >
      <div className={styles.name}>{displayName}</div>
      <div className={styles.description}>{scenario.description}</div>
    </button>
  );
}
