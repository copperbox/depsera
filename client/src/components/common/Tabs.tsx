import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import styles from './Tabs.module.css';

interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab components must be used within <Tabs>');
  return ctx;
}

interface TabsProps {
  defaultTab: string;
  urlParam?: string;
  storageKey?: string;
  children: ReactNode;
}

function Tabs({ defaultTab, urlParam = 'tab', storageKey, children }: TabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const fromUrl = searchParams.get(urlParam);
    if (fromUrl) return fromUrl;
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    }
    return defaultTab;
  }, [searchParams, urlParam, storageKey, defaultTab]);

  const setActiveTab = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(urlParam, value);
          return next;
        },
        { replace: true }
      );
      if (storageKey) {
        localStorage.setItem(storageKey, value);
      }
    },
    [setSearchParams, urlParam, storageKey]
  );

  const ctx = useMemo(
    () => ({ activeTab, setActiveTab }),
    [activeTab, setActiveTab]
  );

  return <TabsContext.Provider value={ctx}>{children}</TabsContext.Provider>;
}

interface TabListProps {
  children: ReactNode;
  'aria-label'?: string;
}

function TabList({ children, 'aria-label': ariaLabel }: TabListProps) {
  return (
    <div className={styles.tabList} role="tablist" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  children: ReactNode;
}

function Tab({ value, children }: TabProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      id={`tab-${value}`}
      className={isActive ? styles.tabActive : styles.tab}
      onClick={() => setActiveTab(value)}
      tabIndex={isActive ? 0 : -1}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
}

function TabPanel({ value, children }: TabPanelProps) {
  const { activeTab } = useTabsContext();
  if (activeTab !== value) return null;

  return (
    <div
      className={styles.tabPanel}
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
    >
      {children}
    </div>
  );
}

export { Tabs, TabList, Tab, TabPanel };
