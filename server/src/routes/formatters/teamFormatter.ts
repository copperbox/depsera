import { Team, Service } from '../../db/types';
import { FormattedTeamMember, FormattedTeamDetail, FormattedTeamListItem } from './types';

// Row type from findMembers
interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
  user_email: string;
  user_name: string;
}

/**
 * Format a team member from a joined row
 */
export function formatTeamMember(row: TeamMemberRow): FormattedTeamMember {
  return {
    team_id: row.team_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    user: {
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
    },
  };
}

/**
 * Format team members array
 */
export function formatTeamMembers(rows: TeamMemberRow[]): FormattedTeamMember[] {
  return rows.map(formatTeamMember);
}

/**
 * Format a team for detail endpoint (includes members and services)
 */
export function formatTeamDetail(
  team: Team,
  members: TeamMemberRow[],
  services: Service[]
): FormattedTeamDetail {
  return {
    ...team,
    members: formatTeamMembers(members),
    services,
  };
}

/**
 * Format a team for list endpoint (includes counts)
 */
export function formatTeamListItem(
  team: Team,
  memberCount: number,
  serviceCount: number
): FormattedTeamListItem {
  return {
    ...team,
    member_count: memberCount,
    service_count: serviceCount,
  };
}

/**
 * Format a newly created team (empty members and services)
 */
export function formatNewTeam(team: Team): FormattedTeamDetail & FormattedTeamListItem {
  return {
    ...team,
    members: [],
    services: [],
    member_count: 0,
    service_count: 0,
  };
}
