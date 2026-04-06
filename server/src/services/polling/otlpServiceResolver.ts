import { StoreRegistry } from '../../stores';
import { Service } from '../../db/types';
import logger from '../../utils/logger';

/**
 * Find a service by name + team, or auto-create it as an OTLP push service.
 * Shared between the metrics and traces OTLP receiver routes.
 */
export function findOrCreateService(
  stores: StoreRegistry,
  teamId: string,
  serviceName: string,
  warnings: string[],
): Service {
  const teamServices = stores.services.findByTeamId(teamId);
  const existing = teamServices.find((s) => s.name === serviceName);

  if (existing) {
    if (existing.health_endpoint_format !== 'otlp') {
      warnings.push(
        `Service "${serviceName}" exists with format "${existing.health_endpoint_format}" — receiving OTLP data but not overwriting format`
      );
    }
    return existing;
  }

  // Auto-register new service
  const service = stores.services.create({
    name: serviceName,
    team_id: teamId,
    health_endpoint: '',
    health_endpoint_format: 'otlp',
    poll_interval_ms: 0,
  });

  logger.info({ serviceId: service.id, serviceName, teamId }, 'auto-registered OTLP service');

  return service;
}
