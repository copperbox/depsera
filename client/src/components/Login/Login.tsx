import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const error = searchParams.get('error');

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Dependencies Dashboard</h1>
        <p className={styles.subtitle}>Sign in to continue</p>

        {error && (
          <div className={styles.error}>
            {error === 'auth_failed'
              ? 'Authentication failed. Please try again.'
              : error === 'state_mismatch'
                ? 'Session expired. Please try again.'
                : 'An error occurred. Please try again.'}
          </div>
        )}

        <button className={styles.button} onClick={login}>
          Sign In with SSO
        </button>
      </div>
    </div>
  );
}

export default Login;
