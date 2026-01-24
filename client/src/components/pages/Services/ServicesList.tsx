import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchServices, fetchTeams } from '../../../api/services';
import type { Service, TeamWithCounts } from '../../../types/service';
import StatusBadge, { type BadgeStatus } from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ServiceForm from './ServiceForm';
import styles from './Services.module.css';

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getHealthBadgeStatus(status: string): BadgeStatus {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
      return 'critical';
    default:
      return 'unknown';
  }
}

function ServicesList() {
  const { isAdmin } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [servicesData, teamsData] = await Promise.all([
        fetchServices(),
        fetchTeams(),
      ]);
      setServices(servicesData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch = service.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesTeam = !teamFilter || service.team_id === teamFilter;
      return matchesSearch && matchesTeam;
    });
  }, [services, searchQuery, teamFilter]);

  const handleServiceCreated = () => {
    setIsAddModalOpen(false);
    loadData();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading services...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadData} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Services</h1>
        {isAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className={styles.addButton}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10 5v10M5 10h10" />
            </svg>
            Add Service
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M13 13l4 4" />
          </svg>
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className={styles.teamSelect}
          aria-label="Filter by team"
        >
          <option value="">All Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {filteredServices.length === 0 ? (
        <div className={styles.emptyState}>
          {services.length === 0 ? (
            <>
              <p>No services have been added yet.</p>
              {isAdmin && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className={styles.addButton}
                >
                  Add your first service
                </button>
              )}
            </>
          ) : (
            <p>No services match your search criteria.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Status</th>
                <th>Dependencies</th>
                <th>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service) => (
                <tr key={service.id}>
                  <td>
                    <Link to={`/services/${service.id}`} className={styles.serviceLink}>
                      {service.name}
                    </Link>
                  </td>
                  <td className={styles.teamCell}>{service.team.name}</td>
                  <td>
                    <StatusBadge
                      status={getHealthBadgeStatus(service.health.status)}
                      size="small"
                    />
                  </td>
                  <td className={styles.depsCell}>
                    <span className={styles.depsCount}>
                      {service.health.healthy_count}/{service.health.total_dependencies}
                    </span>
                    <span className={styles.depsLabel}>healthy</span>
                  </td>
                  <td className={styles.timeCell}>
                    {formatRelativeTime(service.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Service"
        size="medium"
      >
        <ServiceForm
          teams={teams}
          onSuccess={handleServiceCreated}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default ServicesList;
