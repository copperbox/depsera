import type { SelectHTMLAttributes, ReactNode } from 'react';
import styles from './Select.module.css';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function Select({
  label,
  children,
  className = '',
  id,
  ...props
}: SelectProps) {
  return (
    <div className={styles.container}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className={`${styles.select} ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
