import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';
import type { Service, Topology, ActiveFailure, Scenario } from '../types';
import {
  fetchTopology,
  fetchServices,
  fetchFailures,
  fetchScenarios,
  injectFailure as apiInjectFailure,
  clearFailure as apiClearFailure,
  clearAllFailures as apiClearAllFailures,
  applyScenario as apiApplyScenario,
  resetTopology as apiResetTopology,
} from '../api/control';
import type { FailureMode, FailureConfig } from '../types';
import { usePolling } from '../hooks/usePolling';

interface ServicesContextValue {
  // Data
  topology: Topology | null;
  services: Service[];
  failures: ActiveFailure[];
  scenarios: Scenario[];
  selectedService: Service | null;

  // Loading states
  loading: boolean;

  // Actions
  selectService: (service: Service | null) => void;
  refresh: () => Promise<void>;
  injectFailure: (serviceId: string, mode: FailureMode, config?: FailureConfig, cascade?: boolean) => Promise<void>;
  clearFailure: (serviceId: string) => Promise<void>;
  clearAllFailures: () => Promise<void>;
  applyScenario: (name: string) => Promise<void>;
  resetTopology: (count?: number) => Promise<void>;
}

const ServicesContext = createContext<ServicesContextValue | null>(null);

interface ServicesProviderProps {
  children: ReactNode;
  pollInterval?: number;
}

export function ServicesProvider({ children, pollInterval = 2000 }: ServicesProviderProps) {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [failures, setFailures] = useState<ActiveFailure[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTopology = useCallback(async () => {
    try {
      const data = await fetchTopology();
      setTopology(data);
    } catch (err) {
      console.error('Failed to load topology:', err);
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    try {
      const data = await fetchScenarios();
      setScenarios(data);
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [servicesData, failuresData] = await Promise.all([
        fetchServices(),
        fetchFailures(),
      ]);
      setServices(servicesData);
      setFailures(failuresData);
    } catch (err) {
      console.error('Failed to refresh:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep selected service in sync with latest fetched data
  useEffect(() => {
    if (selectedService) {
      const updated = services.find(s => s.id === selectedService.id);
      if (updated && updated !== selectedService) {
        setSelectedService(updated);
      }
    }
  }, [services, selectedService]);

  // Initial load - fetch all data in parallel
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadTopology(),
        loadScenarios(),
        refresh(),
      ]);
    };
    init();
  }, [loadTopology, loadScenarios, refresh]);

  // Auto-refresh polling
  usePolling(refresh, { interval: pollInterval, enabled: !loading });

  const selectService = useCallback((service: Service | null) => {
    setSelectedService(service);
  }, []);

  const injectFailure = useCallback(async (
    serviceId: string,
    mode: FailureMode,
    config?: FailureConfig,
    cascade: boolean = true
  ) => {
    await apiInjectFailure(serviceId, mode, config, cascade);
    await refresh();
  }, [refresh]);

  const clearFailure = useCallback(async (serviceId: string) => {
    await apiClearFailure(serviceId);
    await refresh();
  }, [refresh]);

  const clearAllFailures = useCallback(async () => {
    await apiClearAllFailures();
    await refresh();
  }, [refresh]);

  const applyScenario = useCallback(async (name: string) => {
    await apiApplyScenario(name);
    await refresh();
  }, [refresh]);

  const resetTopology = useCallback(async (count?: number) => {
    await apiResetTopology(count);
    setSelectedService(null);
    await loadTopology();
    await refresh();
  }, [loadTopology, refresh]);

  return (
    <ServicesContext.Provider value={{
      topology,
      services,
      failures,
      scenarios,
      selectedService,
      loading,
      selectService,
      refresh,
      injectFailure,
      clearFailure,
      clearAllFailures,
      applyScenario,
      resetTopology,
    }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServicesContext(): ServicesContextValue {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServicesContext must be used within a ServicesProvider');
  }
  return context;
}
