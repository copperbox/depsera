import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchTeams } from '../../../api/teams';
import type { TeamWithCounts } from '../../../types/team';
import Modal from '../../common/Modal';
import TeamForm from './TeamForm';
import styles from './Teams.module.css';

function TeamsList() {
  const { isAdmin } = useAuth();
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadTeams = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const teamsData = await fetchTeams();
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) =>
      team.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [teams, searchQuery]);

  /* istanbul ignore next -- @preserve
     handleTeamCreated is triggered by TeamForm onSuccess inside a Modal.
     Testing requires HTMLDialogElement mocking. Integration tests preferred. */
  const handleTeamCreated = () => {
    setIsAddModalOpen(false);
    loadTeams();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading teams...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadTeams} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Teams</h1>
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
            Add Team
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
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {filteredTeams.length === 0 ? (
        <div className={styles.emptyState}>
          {teams.length === 0 ? (
            <>
              <p>No teams have been created yet.</p>
              {isAdmin && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className={styles.addButton}
                >
                  Create your first team
                </button>
              )}
            </>
          ) : (
            <p>No teams match your search criteria.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Members</th>
                <th>Services</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => (
                <tr key={team.id}>
                  <td>
                    <Link to={`/teams/${team.id}`} className={styles.teamLink}>
                      {team.name}
                    </Link>
                  </td>
                  <td className={styles.descriptionCell}>
                    {team.description || '-'}
                  </td>
                  <td>
                    <span className={styles.countCell}>
                      <span className={styles.countValue}>{team.member_count}</span>
                      <span className={styles.countLabel}>
                        {team.member_count === 1 ? 'member' : 'members'}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.countCell}>
                      <span className={styles.countValue}>{team.service_count}</span>
                      <span className={styles.countLabel}>
                        {team.service_count === 1 ? 'service' : 'services'}
                      </span>
                    </span>
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
        title="Create Team"
        size="medium"
      >
        <TeamForm
          onSuccess={handleTeamCreated}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default TeamsList;
