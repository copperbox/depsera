import { useState, useEffect, useMemo } from 'react';
import { fetchUsers, updateUserRole, deactivateUser } from '../../../api/users';
import type { User, UserRole } from '../../../types/user';
import ConfirmDialog from '../../common/ConfirmDialog';
import styles from './Admin.module.css';

function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Action state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Deactivate confirmation
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const usersData = await fetchUsers();
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && user.is_active) ||
        (statusFilter === 'inactive' && !user.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter]);

  const handleToggleRole = async (user: User) => {
    const newRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    setActionInProgress(user.id);
    setActionError(null);
    try {
      await updateUserRole(user.id, newRole);
      loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeactivate = async () => {
    if (!userToDeactivate) return;
    setIsDeactivating(true);
    try {
      await deactivateUser(userToDeactivate.id);
      setUserToDeactivate(null);
      loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to deactivate user');
      setUserToDeactivate(null);
    } finally {
      setIsDeactivating(false);
    }
  };

  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.is_active).length;

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadUsers} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
      </div>

      {actionError && (
        <div className={styles.actionError}>
          {actionError}
          <button onClick={() => setActionError(null)} className={styles.dismissButton}>
            Dismiss
          </button>
        </div>
      )}

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
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className={styles.statusSelect}
          aria-label="Filter by status"
        >
          <option value="all">All Users</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {filteredUsers.length === 0 ? (
        <div className={styles.emptyState}>
          {users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            <p>No users match your search criteria.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isLastAdmin = user.role === 'admin' && activeAdminCount <= 1;
                const isProcessing = actionInProgress === user.id;

                return (
                  <tr key={user.id} className={!user.is_active ? styles.inactiveRow : ''}>
                    <td className={styles.nameCell}>{user.name}</td>
                    <td className={styles.emailCell}>{user.email}</td>
                    <td>
                      <span
                        className={`${styles.roleBadge} ${
                          user.role === 'admin' ? styles.roleAdmin : styles.roleUser
                        }`}
                      >
                        {user.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          user.is_active ? styles.statusActive : styles.statusInactive
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          onClick={() => handleToggleRole(user)}
                          disabled={isProcessing || (isLastAdmin && user.role === 'admin')}
                          className={`${styles.actionButton} ${styles.roleButton}`}
                          title={
                            isLastAdmin && user.role === 'admin'
                              ? 'Cannot demote the last admin'
                              : user.role === 'admin'
                              ? 'Demote to User'
                              : 'Promote to Admin'
                          }
                        >
                          {isProcessing ? '...' : user.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        {user.is_active && (
                          <button
                            onClick={() => setUserToDeactivate(user)}
                            disabled={isProcessing || isLastAdmin}
                            className={`${styles.actionButton} ${styles.deactivateButton}`}
                            title={
                              isLastAdmin
                                ? 'Cannot deactivate the last admin'
                                : 'Deactivate user'
                            }
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!userToDeactivate}
        onClose={() => setUserToDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate User"
        message={`Are you sure you want to deactivate "${userToDeactivate?.name}"? They will be removed from all teams and will no longer be able to log in.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={isDeactivating}
      />
    </div>
  );
}

export default UserManagement;
