import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './SearchableSelect.module.css';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  allowCustom?: boolean;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  id,
  allowCustom = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const grouped = filtered.reduce<Record<string, SelectOption[]>>((acc, opt) => {
    const group = opt.group || '';
    if (!acc[group]) acc[group] = [];
    acc[group].push(opt);
    return acc;
  }, {});

  const selectedLabel = options.find((o) => o.value === value)?.label || (allowCustom ? value : '');

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange('');
    setSearch('');
    setIsOpen(false);
  }, [onChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className={styles.container} ref={containerRef}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        id={id}
      >
        <span className={value ? styles.selectedText : styles.placeholder}>
          {value ? selectedLabel : placeholder}
        </span>
        <svg className={styles.chevron} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          <div className={styles.searchWrapper}>
            <input
              ref={inputRef}
              type="text"
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              aria-label="Search options"
            />
          </div>
          {value && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
            >
              Clear selection
            </button>
          )}
          <div className={styles.optionsList}>
            {filtered.length === 0 && !allowCustom ? (
              <div className={styles.noResults}>No matches found</div>
            ) : (
              <>
              {allowCustom && search.trim() && !options.some((o) => o.value === search.trim()) && (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={styles.option}
                  onClick={() => handleSelect(search.trim())}
                >
                  Use &ldquo;{search.trim()}&rdquo;
                </button>
              )}
              {filtered.length > 0 &&
                Object.entries(grouped).map(([group, opts]) => (
                  <div key={group}>
                    {group && <div className={styles.groupLabel}>{group}</div>}
                    {opts.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={opt.value === value}
                        className={`${styles.option} ${opt.value === value ? styles.optionSelected : ''}`}
                        onClick={() => handleSelect(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
