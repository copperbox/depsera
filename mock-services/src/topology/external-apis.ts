import { randomUUID } from 'crypto';
import { Topology, ServiceTier, DependencyType } from './types';

export interface ExternalApi {
  name: string;
  url: string;
  type: DependencyType;
}

export const PUBLIC_APIS: ExternalApi[] = [
  { name: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts/1', type: 'rest' },
  { name: 'REST Countries', url: 'https://restcountries.com/v3.1/alpha/US', type: 'rest' },
  { name: 'Cat Facts', url: 'https://catfact.ninja/fact', type: 'rest' },
  { name: 'Dog API', url: 'https://dog.ceo/api/breeds/list/all', type: 'rest' },
  { name: 'Open Meteo', url: 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current_weather=true', type: 'rest' },
  { name: 'IP API', url: 'https://ipapi.co/json/', type: 'rest' },
  { name: 'Bored API', url: 'https://bored-api.appbrewery.com/random', type: 'rest' },
  { name: 'HTTPBin', url: 'https://httpbin.org/get', type: 'rest' }
];

/**
 * Mutates topology to add 1-2 external API dependencies to ~30% of frontend and API-tier services.
 */
export function assignExternalApis(topology: Topology): void {
  const eligibleServices = topology.services.filter(
    s => s.tier === ServiceTier.FRONTEND || s.tier === ServiceTier.API
  );

  const shuffledApis = [...PUBLIC_APIS].sort(() => Math.random() - 0.5);
  let apiIndex = 0;

  for (const service of eligibleServices) {
    if (Math.random() > 0.3) continue;

    const count = Math.random() < 0.5 ? 1 : 2;

    for (let i = 0; i < count && apiIndex < shuffledApis.length; i++) {
      const api = shuffledApis[apiIndex % shuffledApis.length];
      apiIndex++;

      service.dependencies.push({
        serviceId: randomUUID(),
        type: api.type,
        externalUrl: api.url,
        externalName: api.name
      });
    }
  }
}
