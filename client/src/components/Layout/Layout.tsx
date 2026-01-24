import { Outlet } from 'react-router-dom';
import styles from './Layout.module.css';

function Layout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dependencies Dashboard</h1>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Dependencies Dashboard</p>
      </footer>
    </div>
  );
}

export default Layout;
