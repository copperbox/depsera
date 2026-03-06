import styles from './Footer.module.css';

function Footer() {
  return (
    <footer className={styles.footer}>
      Depsera v{__APP_VERSION__}
    </footer>
  );
}

export default Footer;
