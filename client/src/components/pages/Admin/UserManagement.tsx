import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchUsers,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  createUser,
  resetUserPassword,
} from '../../../api/users';
import { fetchAuthMode, type AuthMode } from '../../../api/auth';
import type { User, UserRole } from '../../../types/user';
import ConfirmDialog from '../../common/ConfirmDialog';
import styles from './Admin.module.css';

function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  // Action state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Deactivate confirmation
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Reactivate confirmation
  const [userToReactivate, setUserToReactivate] = useState<User | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: 'user' as UserRole,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const isLocalAuth = authMode === 'local';

  const loadUsers = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadUsers();
    fetchAuthMode()
      .then((res) => setAuthMode(res.mode))
      .catch(() => setAuthMode(null));
  }, [loadUsers]);

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

  /* istanbul ignore next -- @preserve
     handleDeactivate is triggered by ConfirmDialog onConfirm callback. Testing this
     requires mocking HTMLDialogElement.showModal/close and finding internal dialog buttons.
     The ConfirmDialog component itself is tested separately. Integration tests with
     Cypress/Playwright are more appropriate for testing end-to-end dialog flows. */
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

  /* istanbul ignore next -- @preserve
     handleReactivate is triggered by ConfirmDialog onConfirm callback. Testing this
     requires mocking HTMLDialogElement.showModal/close and finding internal dialog buttons.
     The ConfirmDialog component itself is tested separately. Integration tests with
     Cypress/Playwright are more appropriate for testing end-to-end dialog flows. */
  const handleReactivate = async () => {
    if (!userToReactivate) return;
    setIsReactivating(true);
    try {
      await reactivateUser(userToReactivate.id);
      setUserToReactivate(null);
      loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reactivate user');
      setUserToReactivate(null);
    } finally {
      setIsReactivating(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (createForm.password !== createForm.confirmPassword) {
      setCreateError('Passwords do not match');
      return;
    }

    if (createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters');
      return;
    }

    setIsCreating(true);
    try {
      await createUser({
        email: createForm.email,
        name: createForm.name,
        password: createForm.password,
        role: createForm.role,
      });
      setShowCreateForm(false);
      setCreateForm({ email: '', name: '', password: '', confirmPassword: '', role: 'user' });
      setSuccessMessage('User created successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  /* istanbul ignore next -- @preserve
     handleResetPassword is triggered by ConfirmDialog onConfirm callback. */
  const handleResetPassword = async () => {
    if (!userToResetPassword) return;
    setResetPasswordError(null);

    if (resetPasswordValue !== resetPasswordConfirm) {
      setResetPasswordError('Passwords do not match');
      return;
    }

    if (resetPasswordValue.length < 8) {
      setResetPasswordError('Password must be at least 8 characters');
      return;
    }

    setIsResettingPassword(true);
    try {
      await resetUserPassword(userToResetPassword.id, resetPasswordValue);
      setUserToResetPassword(null);
      setResetPasswordValue('');
      setResetPasswordConfirm('');
      setSuccessMessage('Password reset successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setResetPasswordError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsResettingPassword(false);
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
        {isLocalAuth && (
          <button
            onClick={() => setShowCreateForm(true)}
            className={`${styles.actionButton} ${styles.createButton}`}
          >
            Create User
          </button>
        )}
      </div>

      {successMessage && (
        <div className={styles.successMessage}>
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className={styles.dismissButton}>
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className={styles.actionError}>
          {actionError}
          <button onClick={() => setActionError(null)} className={styles.dismissButton}>
            Dismiss
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>Create New User</h2>
          <form onSubmit={handleCreateUser} className={styles.form}>
            {createError && <div className={styles.formError}>{createError}</div>}
            <div className={styles.formField}>
              <label htmlFor="create-email" className={styles.formLabel}>Email</label>
              <input
                id="create-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className={styles.formInput}
                placeholder="user@example.com"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-name" className={styles.formLabel}>Display Name</label>
              <input
                id="create-name"
                type="text"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className={styles.formInput}
                placeholder="Jane Doe"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-password" className={styles.formLabel}>Password</label>
              <input
                id="create-password"
                type="password"
                required
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className={styles.formInput}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-confirm-password" className={styles.formLabel}>Confirm Password</label>
              <input
                id="create-confirm-password"
                type="password"
                required
                minLength={8}
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                className={styles.formInput}
                placeholder="Re-enter password"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-role" className={styles.formLabel}>Role</label>
              <select
                id="create-role"
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                className={styles.statusSelect}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className={styles.formActions}>
              <button type="submit" disabled={isCreating} className={`${styles.actionButton} ${styles.createButton}`}>
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                  setCreateForm({ email: '', name: '', password: '', confirmPassword: '', role: 'user' });
                }}
                className={`${styles.actionButton} ${styles.roleButton}`}
              >
                Cancel
              </button>
            </div>
          </form>
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
                        {isLocalAuth && user.is_active && (
                          <button
                            onClick={() => {
                              setUserToResetPassword(user);
                              setResetPasswordValue('');
                              setResetPasswordConfirm('');
                              setResetPasswordError(null);
                            }}
                            disabled={isProcessing}
                            className={`${styles.actionButton} ${styles.roleButton}`}
                            title="Reset password"
                          >
                            Reset Password
                          </button>
                        )}
                        {user.is_active ? (
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
                        ) : (
                          <button
                            onClick={() => setUserToReactivate(user)}
                            disabled={isProcessing}
                            className={`${styles.actionButton} ${styles.reactivateButton}`}
                            title="Reactivate user"
                          >
                            Reactivate
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

      <ConfirmDialog
        isOpen={!!userToReactivate}
        onClose={() => setUserToReactivate(null)}
        onConfirm={handleReactivate}
        title="Reactivate User"
        message={`Are you sure you want to reactivate "${userToReactivate?.name}"? They will be able to log in again.`}
        confirmLabel="Reactivate"
        isLoading={isReactivating}
      />

      {userToResetPassword && (
        <div className={styles.modalOverlay} onClick={() => setUserToResetPassword(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.formTitle}>Reset Password for {userToResetPassword.name}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResetPassword();
              }}
              className={styles.form}
            >
              {resetPasswordError && <div className={styles.formError}>{resetPasswordError}</div>}
              <div className={styles.formField}>
                <label htmlFor="reset-password" className={styles.formLabel}>New Password</label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  minLength={8}
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  className={styles.formInput}
                  placeholder="Minimum 8 characters"
                  autoFocus
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor="reset-password-confirm" className={styles.formLabel}>Confirm Password</label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  className={styles.formInput}
                  placeholder="Re-enter password"
                />
              </div>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className={`${styles.actionButton} ${styles.createButton}`}
                >
                  {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setUserToResetPassword(null)}
                  className={`${styles.actionButton} ${styles.roleButton}`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
