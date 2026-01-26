import { Request, Response } from 'express';
import { GraphService, getGraphService, GraphResponse } from '../../services/graph';

/**
 * HTTP handler for the dependency graph endpoint.
 * Supports filtering by team, service, or dependency.
 */
export function getGraph(req: Request, res: Response): void {
  try {
    const { team, service, dependency } = req.query;
    const graphService = getGraphService();

    let graph: GraphResponse;

    if (dependency && typeof dependency === 'string') {
      graph = graphService.getDependencySubgraph(dependency);
    } else if (service && typeof service === 'string') {
      graph = graphService.getServiceSubgraph(service);
    } else if (team && typeof team === 'string') {
      graph = graphService.getTeamGraph(team);
    } else {
      graph = graphService.getFullGraph();
    }

    res.json(graph);
  } catch (error) {
    console.error('Error fetching graph:', error);
    res.status(500).json({
      error: 'Failed to fetch graph data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
