import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getOtlpStats(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    const allServices = stores.services.findByTeamId(id);
    const otlpServices = allServices.filter(s => s.health_endpoint_format === 'otlp');
    const apiKeys = stores.teamApiKeys.findByTeamId(id);

    // Usage summaries for rate limit display
    const keyIds = apiKeys.map(k => k.id);
    const now = new Date().toISOString();
    const minus1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const minus24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const minus7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const summaries1h = stores.apiKeyUsage.getSummaryForKeys(keyIds, minus1h, now);
    const summaries24h = stores.apiKeyUsage.getSummaryForKeys(keyIds, minus24h, now);
    const summaries7d = stores.apiKeyUsage.getSummaryForKeys(keyIds, minus7d, now);
    const defaultRpm = parseInt(process.env.OTLP_PER_KEY_RATE_LIMIT_RPM ?? '150000', 10);

    const services = otlpServices.map(s => {
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

    const summary = {
      total_otlp_services: otlpServices.length,
      active_services: otlpServices.filter(s => s.is_active).length,
      services_with_errors: otlpServices.filter(s => s.last_poll_success === 0).length,
      services_never_pushed: otlpServices.filter(s => s.last_poll_success === null).length,
    };

    res.json({
      services,
      apiKeys: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
        rate_limit_rpm: k.rate_limit_rpm ?? defaultRpm,
        rate_limit_is_custom: k.rate_limit_rpm !== null,
        rate_limit_admin_locked: Boolean(k.rate_limit_admin_locked),
        usage_1h: summaries1h.get(k.id)?.push_count ?? 0,
        usage_24h: summaries24h.get(k.id)?.push_count ?? 0,
        usage_7d: summaries7d.get(k.id)?.push_count ?? 0,
        rejected_24h: summaries24h.get(k.id)?.rejected_count ?? 0,
        rejected_7d: summaries7d.get(k.id)?.rejected_count ?? 0,
      })),
      summary,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'getting OTLP stats');
  }
}
