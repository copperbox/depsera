import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WallboardDependency } from '../../../types/wallboard';

// Mock chart components
jest.mock('../../Charts/LatencyChart', () => ({
  LatencyChart: ({ dependencyId }: { dependencyId: string }) => (
    <div data-testid="latency-chart">{dependencyId}</div>
  ),
}));

jest.mock('../../Charts/HealthTimeline', () => ({
  HealthTimeline: ({ dependencyId }: { dependencyId: string }) => (
    <div data-testid="health-timeline">{dependencyId}</div>
  ),
}));

import { DependencyDetailPanel } from './DependencyDetailPanel';

function makeDep(overrides: Partial<WallboardDependency> = {}): WallboardDependency {
  return {
    canonical_name: 'PostgreSQL',
    primary_dependency_id: 'dep-1',
    health_status: 'healthy',
    type: 'database',
    latency: { min: 10, avg: 20, max: 30 },
    last_checked: '2025-01-01T12:00:00Z',
    error_message: null,
    impact: null,
    description: null,
    effective_contact: null,
    effective_impact: null,
    linked_service: null,
    reporters: [
      {
        dependency_id: 'dep-1',
        service_id: 'svc-1',
        service_name: 'Service Alpha',
        service_team_id: 'team-1',
        service_team_name: 'Team One',
        healthy: 1,
        health_state: 0,
        latency_ms: 20,
        last_checked: '2025-01-01T12:00:00Z',
        skipped: 0,
      },
    ],
    team_ids: ['team-1'],
    ...overrides,
  };
}

function renderPanel(dep: WallboardDependency, onClose = jest.fn()) {
  return render(
    <MemoryRouter>
      <DependencyDetailPanel dependency={dep} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe('DependencyDetailPanel', () => {
  it('renders the dependency name as title', () => {
    renderPanel(makeDep());

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });

  it('renders health status badge', () => {
    renderPanel(makeDep({ health_status: 'critical' }));

    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders type badge', () => {
    renderPanel(makeDep({ type: 'database' }));

    expect(screen.getByText('database')).toBeInTheDocument();
  });

  it('renders reporter list with service names', () => {
    renderPanel(makeDep({
      reporters: [
        {
          dependency_id: 'dep-1',
          service_id: 'svc-1',
          service_name: 'Service Alpha',
          service_team_id: 'team-1',
          service_team_name: 'Team One',
          healthy: 1,
          health_state: 0,
          latency_ms: 20,
          last_checked: '2025-01-01T12:00:00Z',
          skipped: 0,
        },
        {
          dependency_id: 'dep-2',
          service_id: 'svc-2',
          service_name: 'Service Beta',
          service_team_id: 'team-2',
          service_team_name: 'Team Two',
          healthy: 0,
          health_state: 2,
          latency_ms: 100,
          last_checked: '2025-01-01T12:00:00Z',
          skipped: 0,
        },
      ],
    }));

    expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    expect(screen.getByText('Service Beta')).toBeInTheDocument();
    expect(screen.getByText('Team One')).toBeInTheDocument();
    expect(screen.getByText('Team Two')).toBeInTheDocument();
  });

  it('renders linked service section when linked_service exists', () => {
    renderPanel(makeDep({
      linked_service: { id: 'svc-target', name: 'Target Service' },
    }));

    expect(screen.getByText('Associated With')).toBeInTheDocument();
    expect(screen.getByText('Target Service')).toBeInTheDocument();
  });

  it('does not render linked service section when null', () => {
    renderPanel(makeDep({ linked_service: null }));

    expect(screen.queryByText('Associated With')).not.toBeInTheDocument();
  });

  it('renders chart components with primary dependency id', () => {
    renderPanel(makeDep({ primary_dependency_id: 'dep-42' }));

    const latencyChart = screen.getByTestId('latency-chart');
    const healthTimeline = screen.getByTestId('health-timeline');

    expect(latencyChart.textContent).toBe('dep-42');
    expect(healthTimeline.textContent).toBe('dep-42');
  });

  it('renders error message when present', () => {
    renderPanel(makeDep({ error_message: 'Connection refused' }));

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('does not render error message when null', () => {
    renderPanel(makeDep({ error_message: null }));

    expect(screen.queryByText('Connection refused')).not.toBeInTheDocument();
  });

  it('renders impact when present', () => {
    renderPanel(makeDep({ impact: 'Data unavailable' }));

    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
  });

  it('renders description when present', () => {
    renderPanel(makeDep({ description: 'Main database' }));

    expect(screen.getByText('Main database')).toBeInTheDocument();
  });

  it('renders View in Graph link', () => {
    renderPanel(makeDep({ primary_dependency_id: 'dep-1' }));

    const link = screen.getByText('View in Graph');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/graph?dependency=dep-1');
  });

  it('renders View Linked Service link when linked_service exists', () => {
    renderPanel(makeDep({
      linked_service: { id: 'svc-target', name: 'Target Service' },
    }));

    const link = screen.getByText('View Linked Service');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/services/svc-target');
  });

  it('does not render View Linked Service link when no linked_service', () => {
    renderPanel(makeDep({ linked_service: null }));

    expect(screen.queryByText('View Linked Service')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    renderPanel(makeDep(), onClose);

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows reporter latency', () => {
    renderPanel(makeDep({
      reporters: [{
        dependency_id: 'dep-1',
        service_id: 'svc-1',
        service_name: 'Service Alpha',
        service_team_id: 'team-1',
        service_team_name: 'Team One',
        healthy: 1,
        health_state: 0,
        latency_ms: 1500,
        last_checked: '2025-01-01T12:00:00Z',
        skipped: 0,
      }],
    }));

    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('shows reporter latency in ms for values under 1000', () => {
    renderPanel(makeDep({
      reporters: [{
        dependency_id: 'dep-1',
        service_id: 'svc-1',
        service_name: 'Service Alpha',
        service_team_id: 'team-1',
        service_team_name: 'Team One',
        healthy: 1,
        health_state: 0,
        latency_ms: 250,
        last_checked: '2025-01-01T12:00:00Z',
        skipped: 0,
      }],
    }));

    expect(screen.getByText('250ms')).toBeInTheDocument();
  });

  describe('contact display', () => {
    it('renders contact section with key-value pairs when effective_contact is valid JSON', () => {
      renderPanel(makeDep({
        effective_contact: '{"email":"db-team@example.com","slack":"#db-support"}',
      }));

      const contactSection = screen.getByTestId('contact-section');
      expect(contactSection).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('db-team@example.com')).toBeInTheDocument();
      expect(screen.getByText('slack')).toBeInTheDocument();
      expect(screen.getByText('#db-support')).toBeInTheDocument();
    });

    it('renders Contact section title when contact data exists', () => {
      renderPanel(makeDep({
        effective_contact: '{"email":"test@example.com"}',
      }));

      expect(screen.getByText('Contact')).toBeInTheDocument();
    });

    it('does not render contact section when effective_contact is null', () => {
      renderPanel(makeDep({ effective_contact: null }));

      expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
      expect(screen.queryByText('Contact')).not.toBeInTheDocument();
    });

    it('does not render contact section when effective_contact is invalid JSON', () => {
      renderPanel(makeDep({ effective_contact: 'not-json' }));

      expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
    });

    it('does not render contact section when effective_contact is a JSON array', () => {
      renderPanel(makeDep({ effective_contact: '["a","b"]' }));

      expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
    });

    it('renders multiple contact entries', () => {
      renderPanel(makeDep({
        effective_contact: '{"email":"a@b.com","slack":"#chan","pager":"555-1234"}',
      }));

      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('a@b.com')).toBeInTheDocument();
      expect(screen.getByText('slack')).toBeInTheDocument();
      expect(screen.getByText('#chan')).toBeInTheDocument();
      expect(screen.getByText('pager')).toBeInTheDocument();
      expect(screen.getByText('555-1234')).toBeInTheDocument();
    });
  });

  describe('effective impact display', () => {
    it('renders effective_impact when present', () => {
      renderPanel(makeDep({
        effective_impact: 'Critical — primary database',
      }));

      expect(screen.getByText('Critical — primary database')).toBeInTheDocument();
    });

    it('falls back to raw impact when effective_impact is null', () => {
      renderPanel(makeDep({
        impact: 'Polled impact',
        effective_impact: null,
      }));

      expect(screen.getByText('Polled impact')).toBeInTheDocument();
    });

    it('does not render impact when both effective_impact and impact are null', () => {
      renderPanel(makeDep({
        impact: null,
        effective_impact: null,
      }));

      expect(screen.queryByText('Impact')).not.toBeInTheDocument();
    });

    it('shows override badge when effective_impact differs from raw impact', () => {
      renderPanel(makeDep({
        impact: 'Polled impact',
        effective_impact: 'Overridden impact',
      }));

      expect(screen.getByText('Overridden impact')).toBeInTheDocument();
      expect(screen.getByTestId('impact-override-badge')).toBeInTheDocument();
      expect(screen.getByText('override')).toBeInTheDocument();
    });

    it('does not show override badge when effective_impact matches raw impact', () => {
      renderPanel(makeDep({
        impact: 'Same impact',
        effective_impact: 'Same impact',
      }));

      expect(screen.getByText('Same impact')).toBeInTheDocument();
      expect(screen.queryByTestId('impact-override-badge')).not.toBeInTheDocument();
    });

    it('does not show override badge when effective_impact is null', () => {
      renderPanel(makeDep({
        impact: 'Some impact',
        effective_impact: null,
      }));

      expect(screen.queryByTestId('impact-override-badge')).not.toBeInTheDocument();
    });
  });
});
