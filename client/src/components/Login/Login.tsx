import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAuthMode, localLogin, AuthMode } from '../../api/auth';
import styles from './Login.module.css';

function Login() {
  const { isAuthenticated, isLoading, login, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const error = searchParams.get('error');

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      fetchAuthMode()
        .then(({ mode }) => setAuthMode(mode))
        .catch(() => setAuthMode('oidc'));
    }
  }, [isLoading, isAuthenticated]);

  const handleLocalLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    try {
      await localLogin(email, password);
      await checkAuth();
      navigate('/', { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || (!isAuthenticated && authMode === null)) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const displayError = loginError || (error
    ? error === 'auth_failed'
      ? 'Authentication failed. Please try again.'
      : error === 'state_mismatch'
        ? 'Session expired. Please try again.'
        : 'An error occurred. Please try again.'
    : null);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Depsera</h1>
        <p className={styles.subtitle}>Sign in to continue</p>

        {displayError && (
          <div className={styles.error}>
            {displayError}
          </div>
        )}

        {authMode === 'local' ? (
          <form className={styles.form} onSubmit={handleLocalLogin}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">Email</label>
              <input
                id="email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>
            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <button className={styles.button} onClick={login}>
            Sign In with SSO
          </button>
        )}
      </div>
    </div>
  );
}

export default Login;
