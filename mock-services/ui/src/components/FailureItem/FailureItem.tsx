import type { ActiveFailure } from '../../types';
import styles from './FailureItem.module.css';

interface FailureItemProps {
  failure: ActiveFailure;
  onClear: () => void;
}

export function FailureItem({ failure, onClear }: FailureItemProps) {
  const displayMode = failure.state.mode.replace('_', ' ');

  return (
    <div className={styles.item}>
      <div className={styles.info}>
        <div className={styles.serviceName}>{failure.serviceName}</div>
        <div className={styles.mode}>{displayMode}</div>
      </div>
      <button
        className={styles.clearButton}
        onClick={onClear}
        title="Clear failure"
      >
        &times;
      </button>
    </div>
  );
}
