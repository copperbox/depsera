import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchTeam,
  deleteTeam,
  fetchUsers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
} from '../api/teams';
import type { TeamWithDetails, TeamMember, TeamMemberRole } from '../types/team';
import type { User } from '../types/user';

export interface UseTeamDetailReturn {
  team: TeamWithDetails | null;
  users: User[];
  availableUsers: User[];
  isLoading: boolean;
  error: string | null;
  isDeleting: boolean;
  loadTeam: () => Promise<void>;
  handleDelete: () => Promise<void>;
  setError: (error: string | null) => void;
}

export interface UseTeamMembersReturn {
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  selectedRole: TeamMemberRole;
  setSelectedRole: (role: TeamMemberRole) => void;
  isAddingMember: boolean;
  addMemberError: string | null;
  actionInProgress: string | null;
  handleAddMember: () => Promise<void>;
  handleToggleRole: (member: TeamMember) => Promise<void>;
  handleRemoveMember: (userId: string) => Promise<void>;
}

export function useTeamDetail(
  id: string | undefined,
  isAdmin: boolean
): UseTeamDetailReturn {
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamWithDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [teamData, usersData] = await Promise.all([
        fetchTeam(id),
        isAdmin ? fetchUsers() : Promise.resolve([]),
      ]);
      setTeam(teamData);
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setIsLoading(false);
    }
  }, [id, isAdmin]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteTeam(id);
      navigate('/teams');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  }, [id, navigate]);

  const availableUsers = useMemo(
    () => users.filter((user) => !team?.members.some((member) => member.user_id === user.id)),
    [users, team?.members]
  );

  return {
    team,
    users,
    availableUsers,
    isLoading,
    error,
    isDeleting,
    loadTeam,
    handleDelete,
    setError,
  };
}

export function useTeamMembers(
  id: string | undefined,
  loadTeam: () => Promise<void>,
  setError: (error: string | null) => void
): UseTeamMembersReturn {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<TeamMemberRole>('member');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const handleAddMember = useCallback(async () => {
    if (!id || !selectedUserId) return;
    setIsAddingMember(true);
    setAddMemberError(null);
    try {
      await addTeamMember(id, { user_id: selectedUserId, role: selectedRole });
      setSelectedUserId('');
      setSelectedRole('member');
      loadTeam();
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  }, [id, selectedUserId, selectedRole, loadTeam]);

  const handleToggleRole = useCallback(async (member: TeamMember) => {
    if (!id) return;
    const newRole: TeamMemberRole = member.role === 'lead' ? 'member' : 'lead';
    setActionInProgress(member.user_id);
    try {
      await updateTeamMember(id, member.user_id, { role: newRole });
      loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setActionInProgress(null);
    }
  }, [id, loadTeam, setError]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!id) return;
    setActionInProgress(userId);
    try {
      await removeTeamMember(id, userId);
      loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setActionInProgress(null);
    }
  }, [id, loadTeam, setError]);

  return {
    selectedUserId,
    setSelectedUserId,
    selectedRole,
    setSelectedRole,
    isAddingMember,
    addMemberError,
    actionInProgress,
    handleAddMember,
    handleToggleRole,
    handleRemoveMember,
  };
}
