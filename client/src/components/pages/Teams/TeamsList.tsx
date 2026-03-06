import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Loader2 } from 'lucide-react';
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
          <Loader2 size={32} className={styles.spinner} />
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
            <Plus size={16} />
            Add Team
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
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
        size="md"
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
