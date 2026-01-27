import { useState, useEffect } from 'react';
import type { Service, TopologyService, FailureMode, FailureConfig } from '../../types';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { Input } from '../common/Input';
import { Checkbox } from '../common/Checkbox';
import styles from './ServicePanel.module.css';

interface ServicePanelProps {
  service: Service;
  topologyService: TopologyService | undefined;
  allServices: Service[];
  onClose: () => void;
  onInjectFailure: (mode: FailureMode, config?: FailureConfig, cascade?: boolean) => Promise<void>;
  onClearFailure: () => Promise<void>;
  onSelectService: (service: Service) => void;
}

export function ServicePanel({
  service,
  topologyService,
  allServices,
  onClose,
  onInjectFailure,
  onClearFailure,
  onSelectService,
}: ServicePanelProps) {
  const [failureMode, setFailureMode] = useState<FailureMode>('outage');
  const [latencyMs, setLatencyMs] = useState(3000);
  const [errorRate, setErrorRate] = useState(0.5);
  const [cascade, setCascade] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const hasFailure = !!service.failureState;
  const isHealthy = service.health.healthy && !hasFailure;
  const isCascaded = service.failureState?.isCascaded;
  const dependencies = topologyService?.dependencies || [];

  // Reset form when service changes
  useEffect(() => {
    setFailureMode('outage');
    setLatencyMs(3000);
    setErrorRate(0.5);
    setCascade(true);
  }, [service.id]);

  const handleInject = async () => {
    setIsLoading(true);
    try {
      const config: FailureConfig = {};
      if (failureMode === 'high_latency') {
        config.latencyMs = latencyMs;
      } else if (failureMode === 'intermittent') {
        config.errorRate = errorRate;
      }
      await onInjectFailure(failureMode, config, cascade);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setIsLoading(true);
    try {
      await onClearFailure();
    } finally {
      setIsLoading(false);
    }
  };

  const renderFailureDetails = () => {
    if (!hasFailure || !service.failureState) return null;

    const mode = service.failureState.mode.replace('_', ' ');
    const config = service.failureState.config || {};

    let configDetail = null;
    if (service.failureState.mode === 'high_latency' && config.latencyMs) {
      configDetail = <div className={styles.configDetail}>Latency: {config.latencyMs}ms</div>;
    } else if (service.failureState.mode === 'intermittent' && config.errorRate) {
      configDetail = <div className={styles.configDetail}>Error rate: {(config.errorRate * 100).toFixed(0)}%</div>;
    } else if (config.errorCode) {
      configDetail = <div className={styles.configDetail}>Error code: {config.errorCode}</div>;
    }

    return (
      <div className={`${styles.failureDetails} ${isCascaded ? styles.cascaded : ''}`}>
        <div className={styles.failureMode}>{mode}</div>
        <div className={styles.failureType}>
          {isCascaded ? 'Cascaded from upstream' : 'Directly injected'}
        </div>
        {configDetail}
      </div>
    );
  };

  const renderDependencies = () => {
    if (dependencies.length === 0) return null;

    const depItems = dependencies.map(dep => {
      const depService = allServices.find(s => s.id === dep.serviceId);
      return {
        id: dep.serviceId,
        name: depService?.name || dep.serviceId,
        healthy: depService ? depService.health.healthy && !depService.failureState : false,
        service: depService,
      };
    });

    return (
      <div className={styles.dependenciesList}>
        <h5>Dependencies ({dependencies.length})</h5>
        {depItems.map(dep => (
          <div
            key={dep.id}
            className={`${styles.depItem} ${dep.service ? styles.depLink : ''}`}
            onClick={() => dep.service && onSelectService(dep.service)}
          >
            <span className={`${styles.depStatus} ${dep.healthy ? styles.healthy : styles.unhealthy}`} />
            {dep.name}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{service.name}</h3>
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>
      </div>

      <div className={styles.content}>
        {/* Service Details */}
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.label}>ID</span>
            <span className={styles.value}>{service.id.slice(0, 8)}...</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Tier</span>
            <span className={styles.value}>{service.tier}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Health</span>
            <span className={`${styles.value} ${isHealthy ? styles.healthy : styles.unhealthy}`}>
              {isHealthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>

          <div className={styles.endpointLinks}>
            <a
              href={`/${service.name}/health`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.endpointLink}
            >
              <span className={styles.endpointIcon}>&#8599;</span> /health
            </a>
            <a
              href={`/${service.name}/dependencies`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.endpointLink}
            >
              <span className={styles.endpointIcon}>&#8599;</span> /dependencies
            </a>
          </div>

          {renderFailureDetails()}
          {renderDependencies()}
        </div>

        {/* Failure Controls */}
        <div className={styles.failureControls}>
          <h4>Inject Failure</h4>

          <Select
            label="Failure Mode"
            id="failureMode"
            value={failureMode}
            onChange={(e) => setFailureMode(e.target.value as FailureMode)}
          >
            <option value="outage">Outage (503)</option>
            <option value="high_latency">High Latency</option>
            <option value="error">Error (500)</option>
            <option value="intermittent">Intermittent</option>
          </Select>

          {failureMode === 'high_latency' && (
            <Input
              label="Latency (ms)"
              id="latencyMs"
              type="number"
              value={latencyMs}
              min={100}
              max={30000}
              onChange={(e) => setLatencyMs(Number(e.target.value))}
            />
          )}

          {failureMode === 'intermittent' && (
            <Input
              label="Error Rate (0-1)"
              id="errorRate"
              type="number"
              value={errorRate}
              min={0}
              max={1}
              step={0.1}
              onChange={(e) => setErrorRate(Number(e.target.value))}
            />
          )}

          <Checkbox
            label="Cascade to dependents"
            id="cascade"
            checked={cascade}
            onChange={(e) => setCascade(e.target.checked)}
          />

          <div className={styles.buttonGroup}>
            <Button
              variant="danger"
              onClick={handleInject}
              disabled={isLoading}
            >
              Inject Failure
            </Button>
            <Button
              variant="secondary"
              onClick={handleClear}
              disabled={isLoading || !hasFailure}
            >
              Clear Failure
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
