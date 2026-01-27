import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({
  label,
  className = '',
  id,
  ...props
}: CheckboxProps) {
  return (
    <label className={`${styles.container} ${className}`} htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        className={styles.checkbox}
        {...props}
      />
      <span className={styles.label}>{label}</span>
    </label>
  );
}
