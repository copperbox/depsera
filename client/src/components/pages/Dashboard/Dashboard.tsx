import styles from './Dashboard.module.css';

function Dashboard() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.placeholder}>
        Dashboard overview will be implemented here.
      </p>
    </div>
  );
}

export default Dashboard;
