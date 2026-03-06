import { Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Header.module.css';

interface HeaderProps {
  onToggleSidebar: () => void;
  onLogout: () => void;
}

function Header({ onToggleSidebar, onLogout }: HeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          className={styles.menuButton}
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <span className={styles.menuIcon} />
        </button>
        <img src="/depsera-sphere.svg" alt="" className={styles.logo} />
        <img src="/depsera-title-thin.svg" alt="Depsera" className={styles.titleImage} />
      </div>
      <div className={styles.headerRight}>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user?.name}</span>
          <span className={styles.userRole}>{user?.role}</span>
        </div>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          <div className={styles.themeToggleTrack}>
            <span className={`${styles.themeToggleIcon} ${theme === 'light' ? styles.active : ''}`}>
              <Sun className={styles.themeIcon} />
            </span>
            <span className={`${styles.themeToggleIcon} ${theme === 'dark' ? styles.active : ''}`}>
              <Moon className={styles.themeIcon} />
            </span>
          </div>
          <span className={`${styles.themeToggleIndicator} ${theme === 'dark' ? styles.dark : ''}`} />
        </button>
        <button className={styles.logoutButton} onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}

export default Header;
