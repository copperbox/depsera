import { useServicesContext } from './contexts/ServicesContext';
import { Header } from './components/Header';
import { TopologyGrid } from './components/TopologyGrid';
import { Sidebar } from './components/Sidebar';
import { ServicePanel } from './components/ServicePanel';
import styles from './App.module.css';

export function App() {
  const {
    topology,
    services,
    failures,
    scenarios,
    selectedService,
    loading,
    selectService,
    injectFailure,
    clearFailure,
    clearAllFailures,
    applyScenario,
    resetTopology,
  } = useServicesContext();

  const handleReset = () => {
    const count = prompt('Enter number of services:', '20');
    if (count) {
      const num = parseInt(count, 10);
      if (!isNaN(num) && num > 0) {
        resetTopology(num);
      }
    }
  };

  const handleClosePanel = () => {
    selectService(null);
  };

  const handleInjectFailure = async (
    mode: Parameters<typeof injectFailure>[1],
    config?: Parameters<typeof injectFailure>[2],
    cascade?: boolean
  ) => {
    if (selectedService) {
      await injectFailure(selectedService.id, mode, config, cascade);
    }
  };

  const handleClearSelectedFailure = async () => {
    if (selectedService) {
      await clearFailure(selectedService.id);
    }
  };

  const topologyService = topology?.services.find(
    s => s.id === selectedService?.id
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading services...</p>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Header
        serviceCount={services.length}
        onClearAll={clearAllFailures}
        onReset={handleReset}
      />

      <main className={styles.main}>
        <div className={styles.layout}>
          <TopologyGrid
            services={services}
            selectedServiceId={selectedService?.id || null}
            onSelectService={selectService}
          />

          <Sidebar
            scenarios={scenarios}
            failures={failures}
            onApplyScenario={applyScenario}
            onClearFailure={clearFailure}
          />
        </div>
      </main>

      {selectedService && (
        <ServicePanel
          service={selectedService}
          topologyService={topologyService}
          allServices={services}
          onClose={handleClosePanel}
          onInjectFailure={handleInjectFailure}
          onClearFailure={handleClearSelectedFailure}
          onSelectService={selectService}
        />
      )}
    </div>
  );
}
