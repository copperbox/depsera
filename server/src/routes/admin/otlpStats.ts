import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getAdminOtlpStats(req: Request, res: Response): void {
  try {
    const stores = getStores();

    const allServices = stores.services.findAll();
    const otlpServices = allServices.filter(s => s.health_endpoint_format === 'otlp');

    // Group by team
    const teamIds = [...new Set(otlpServices.map(s => s.team_id))];

    const teams = teamIds.map(teamId => {
      const team = stores.teams.findById(teamId);
      const teamOtlpServices = otlpServices.filter(s => s.team_id === teamId);
      const apiKeys = stores.teamApiKeys.findByTeamId(teamId);

      const services = teamOtlpServices.map(s => {
        const depCount = stores.dependencies.findByServiceId(s.id).length;
        const errors24h = stores.servicePollHistory.getErrorCount24h(s.id);

        let parsedWarnings: string[] | null = null;
        if (s.poll_warnings) {
          try {
            parsedWarnings = JSON.parse(s.poll_warnings);
          } catch {
            parsedWarnings = null;
          }
        }

        return {
          id: s.id,
          name: s.name,
          is_active: s.is_active,
          last_push_success: s.last_poll_success,
          last_push_error: s.last_poll_error,
          last_push_warnings: parsedWarnings,
          last_push_at: s.updated_at,
          dependency_count: depCount,
          errors_24h: errors24h,
          schema_config: s.schema_config,
        };
      });

      return {
        team_id: teamId,
        team_name: team?.name ?? 'Unknown',
        services,
        apiKeys: apiKeys.map(k => ({
          id: k.id,
          name: k.name,
          key_prefix: k.key_prefix,
          last_used_at: k.last_used_at,
          created_at: k.created_at,
        })),
      };
    });

    const summary = {
      total_otlp_services: otlpServices.length,
      active_services: otlpServices.filter(s => s.is_active).length,
      services_with_errors: otlpServices.filter(s => s.last_poll_success === 0).length,
      services_never_pushed: otlpServices.filter(s => s.last_poll_success === null).length,
      total_teams: teamIds.length,
    };

    res.json({ teams, summary });
  } catch (error) {
    sendErrorResponse(res, error, 'getting admin OTLP stats');
  }
}
