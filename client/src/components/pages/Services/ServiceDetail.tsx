import { useParams } from 'react-router-dom';
import styles from './Services.module.css';

function ServiceDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Service Details</h1>
      <p className={styles.placeholder}>
        Service detail for ID: {id} will be implemented here.
      </p>
    </div>
  );
}

export default ServiceDetail;
