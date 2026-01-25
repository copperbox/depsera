const API_BASE = '/control/api';
let selectedService = null;
let services = [];
let topology = null;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}

async function loadTopology() {
  const result = await fetchJson(`${API_BASE}/topology`);
  if (result.success) {
    topology = result.data;
  }
}

async function loadServices() {
  const result = await fetchJson(`${API_BASE}/services`);
  if (result.success) {
    services = result.data;
    renderServices();
    updateServiceCount();
  }
}

async function loadScenarios() {
  const result = await fetchJson(`${API_BASE}/scenarios`);
  if (result.success) {
    renderScenarios(result.data);
  }
}

async function loadFailures() {
  const result = await fetchJson(`${API_BASE}/failures`);
  if (result.success) {
    renderFailures(result.data);
  }
}

function renderServices() {
  const tiers = ['frontend', 'api', 'backend', 'database'];

  tiers.forEach(tier => {
    const container = document.getElementById(`tier-${tier}`);
    container.innerHTML = '';

    const tierServices = services.filter(s => s.tier === tier);

    tierServices.forEach(service => {
      const hasFailure = !!service.failureState;
      const isHealthy = service.health.healthy && !hasFailure;
      const isCascaded = service.failureState?.isCascaded;

      const card = document.createElement('div');
      card.className = `service-card ${isHealthy ? 'healthy' : 'unhealthy'}`;
      if (isCascaded) {
        card.classList.add('cascaded');
      }
      if (selectedService && selectedService.id === service.id) {
        card.classList.add('selected');
      }

      let statusText = isHealthy ? 'Healthy' : 'Unhealthy';
      let failureBadge = '';

      if (hasFailure) {
        const mode = service.failureState.mode.replace('_', ' ');
        statusText = mode;
        failureBadge = isCascaded
          ? '<span class="failure-badge cascaded">cascaded</span>'
          : '<span class="failure-badge">injected</span>';
      }

      card.innerHTML = `
        <div class="name">${service.name}</div>
        <div class="status">${statusText}</div>
        ${failureBadge}
      `;

      card.addEventListener('click', () => selectService(service));
      container.appendChild(card);
    });
  });
}

function renderScenarios(scenarios) {
  const container = document.getElementById('scenarioList');
  container.innerHTML = '';

  scenarios.forEach(scenario => {
    const btn = document.createElement('button');
    btn.className = 'scenario-btn';
    btn.innerHTML = `
      <div class="name">${scenario.name.replace(/-/g, ' ')}</div>
      <div class="description">${scenario.description}</div>
    `;
    btn.addEventListener('click', () => applyScenario(scenario.name));
    container.appendChild(btn);
  });
}

function renderFailures(failures) {
  const container = document.getElementById('failureList');

  if (failures.length === 0) {
    container.innerHTML = '<div class="empty-state">No active failures</div>';
    return;
  }

  container.innerHTML = '';

  failures.forEach(failure => {
    if (failure.state.isCascaded) return;

    const item = document.createElement('div');
    item.className = 'failure-item';
    item.innerHTML = `
      <div class="info">
        <div class="service-name">${failure.serviceName}</div>
        <div class="mode">${failure.state.mode.replace('_', ' ')}</div>
      </div>
      <button class="clear-btn" title="Clear failure">&times;</button>
    `;

    item.querySelector('.clear-btn').addEventListener('click', () => {
      clearFailure(failure.serviceId);
    });

    container.appendChild(item);
  });
}

function selectService(service) {
  selectedService = service;
  renderServices();
  showPanel(service);
}

function showPanel(service) {
  const panel = document.getElementById('servicePanel');
  const title = document.getElementById('servicePanelTitle');
  const details = document.getElementById('serviceDetails');

  title.textContent = service.name;

  const genService = topology?.services.find(s => s.id === service.id);
  const deps = genService?.dependencies || [];

  let depsHtml = '';
  if (deps.length > 0) {
    const depItems = deps.map(depId => {
      const depService = services.find(s => s.id === depId);
      const name = depService ? depService.name : depId;
      const healthy = depService ? depService.health.healthy : false;
      return { id: depId, name, healthy };
    });
    depsHtml = `
      <div class="dependencies-list">
        <h5>Dependencies (${deps.length})</h5>
        ${depItems.map(dep => `<div class="dep-item dep-link" data-service-id="${dep.id}"><span class="dep-status ${dep.healthy ? 'healthy' : 'unhealthy'}"></span>${dep.name}</div>`).join('')}
      </div>
    `;
  }

  const hasFailure = !!service.failureState;
  const isHealthy = service.health.healthy && !hasFailure;
  const isCascaded = service.failureState?.isCascaded;

  let failureDetails = '';
  if (hasFailure) {
    const mode = service.failureState.mode.replace('_', ' ');
    const config = service.failureState.config || {};
    let configDetails = '';

    if (service.failureState.mode === 'high_latency' && config.latencyMs) {
      configDetails = `<div class="config-detail">Latency: ${config.latencyMs}ms</div>`;
    } else if (service.failureState.mode === 'intermittent' && config.errorRate) {
      configDetails = `<div class="config-detail">Error rate: ${(config.errorRate * 100).toFixed(0)}%</div>`;
    } else if (config.errorCode) {
      configDetails = `<div class="config-detail">Error code: ${config.errorCode}</div>`;
    }

    failureDetails = `
      <div class="failure-details ${isCascaded ? 'cascaded' : ''}">
        <div class="failure-mode">${mode}</div>
        <div class="failure-type">${isCascaded ? 'Cascaded from upstream' : 'Directly injected'}</div>
        ${configDetails}
      </div>
    `;
  }

  details.innerHTML = `
    <div class="detail-row">
      <span class="label">ID</span>
      <span class="value">${service.id.slice(0, 8)}...</span>
    </div>
    <div class="detail-row">
      <span class="label">Tier</span>
      <span class="value">${service.tier}</span>
    </div>
    <div class="detail-row">
      <span class="label">Health</span>
      <span class="value ${isHealthy ? 'healthy' : 'unhealthy'}">
        ${isHealthy ? 'Healthy' : 'Unhealthy'}
      </span>
    </div>
    <div class="endpoint-links">
      <a href="/${service.name}/health" target="_blank" class="endpoint-link">
        <span class="endpoint-icon">&#8599;</span> /health
      </a>
      <a href="/${service.name}/dependencies" target="_blank" class="endpoint-link">
        <span class="endpoint-icon">&#8599;</span> /dependencies
      </a>
    </div>
    ${failureDetails}
    ${depsHtml}
  `;

  panel.classList.remove('hidden');
  panel.classList.add('visible');

  // Add click handlers for dependency links
  details.querySelectorAll('.dep-link').forEach(el => {
    el.addEventListener('click', () => {
      const depId = el.dataset.serviceId;
      const depService = services.find(s => s.id === depId);
      if (depService) {
        selectService(depService);
      }
    });
  });

  updateConfigVisibility();
}

function hidePanel() {
  const panel = document.getElementById('servicePanel');
  panel.classList.remove('visible');
  setTimeout(() => {
    panel.classList.add('hidden');
    selectedService = null;
    renderServices();
  }, 300);
}

function updateConfigVisibility() {
  const mode = document.getElementById('failureModeSelect').value;
  const latencyConfig = document.getElementById('latencyConfig');
  const errorRateConfig = document.getElementById('errorRateConfig');

  latencyConfig.style.display = mode === 'high_latency' ? 'block' : 'none';
  errorRateConfig.style.display = mode === 'intermittent' ? 'block' : 'none';
}

async function injectFailure() {
  if (!selectedService) return;

  const mode = document.getElementById('failureModeSelect').value;
  const cascade = document.getElementById('cascadeCheckbox').checked;
  const latencyMs = parseInt(document.getElementById('latencyInput').value);
  const errorRate = parseFloat(document.getElementById('errorRateInput').value);

  const config = {};
  if (mode === 'high_latency') {
    config.latencyMs = latencyMs;
  } else if (mode === 'intermittent') {
    config.errorRate = errorRate;
  }

  await fetchJson(`${API_BASE}/services/${selectedService.id}/failure`, {
    method: 'POST',
    body: JSON.stringify({ mode, config, cascade })
  });

  await refresh();
}

async function clearFailure(serviceId) {
  const id = serviceId || selectedService?.id;
  if (!id) return;

  await fetchJson(`${API_BASE}/services/${id}/failure`, {
    method: 'DELETE'
  });

  await refresh();
}

async function clearAllFailures() {
  await fetchJson(`${API_BASE}/failures`, {
    method: 'DELETE'
  });

  await refresh();
}

async function resetTopology() {
  const count = prompt('Enter number of services:', '20');
  if (!count) return;

  await fetchJson(`${API_BASE}/reset`, {
    method: 'POST',
    body: JSON.stringify({ count: parseInt(count) })
  });

  hidePanel();
  await loadTopology();
  await refresh();
}

async function applyScenario(name) {
  await fetchJson(`${API_BASE}/scenarios/${name}`, {
    method: 'POST'
  });

  await refresh();
}

function updateServiceCount() {
  const countEl = document.getElementById('serviceCount');
  countEl.textContent = `${services.length} services`;
}

async function refresh() {
  await loadServices();
  await loadFailures();

  if (selectedService) {
    const updated = services.find(s => s.id === selectedService.id);
    if (updated) {
      selectedService = updated;
      showPanel(updated);
    }
  }
}

// Event listeners
document.getElementById('panelClose').addEventListener('click', hidePanel);
document.getElementById('failureModeSelect').addEventListener('change', updateConfigVisibility);
document.getElementById('injectBtn').addEventListener('click', injectFailure);
document.getElementById('clearBtn').addEventListener('click', () => clearFailure());
document.getElementById('clearAllBtn').addEventListener('click', clearAllFailures);
document.getElementById('resetBtn').addEventListener('click', resetTopology);

// Initial load
async function init() {
  await loadTopology();
  await loadServices();
  await loadScenarios();
  await loadFailures();

  // Auto-refresh every 2 seconds
  setInterval(refresh, 2000);
}

init();
