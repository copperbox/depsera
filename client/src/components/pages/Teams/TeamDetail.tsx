import { useParams } from 'react-router-dom';
import styles from './Teams.module.css';

function TeamDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Team Details</h1>
      <p className={styles.placeholder}>
        Team detail for ID: {id} will be implemented here.
      </p>
    </div>
  );
}

export default TeamDetail;
