import { useState } from 'react';
import { Button } from '../common/Button';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Header.module.css';

interface HeaderProps {
  serviceCount: number;
  onClearAll: () => Promise<void>;
  onReset: () => void;
}

export function Header({ serviceCount, onClearAll, onReset }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [isClearing, setIsClearing] = useState(false);

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await onClearAll();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Mock Services Control Panel</h1>
      <div className={styles.actions}>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <Button
          variant="warning"
          onClick={handleClearAll}
          disabled={isClearing}
        >
          Clear All Failures
        </Button>
        <Button
          variant="danger"
          onClick={onReset}
        >
          Reset Topology
        </Button>
        <span className={styles.serviceCount}>
          {serviceCount} services
        </span>
      </div>
    </header>
  );
}
