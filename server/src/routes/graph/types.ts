/**
 * Re-export graph types from the service module for backwards compatibility.
 * New code should import directly from '../../services/graph'.
 */
export {
  NodeType,
  ServiceNodeData,
  GraphNode,
  GraphEdgeData,
  GraphEdge,
  GraphResponse,
} from '../../services/graph';
