import { Router } from 'express';
import { getGraph } from './getGraph';

const router = Router();

// GET /api/graph - Get graph data
// Query params:
//   - team: Filter by team ID
//   - service: Get subgraph for specific service and upstream chain
//   - dependency: Get subgraph for specific dependency
router.get('/', getGraph);

export default router;
