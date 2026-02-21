# 6. Dependency Graph

**[Implemented]**

## 6.1 Graph Building

The `GraphService` builds graphs by querying services and dependencies, then constructing nodes and edges via `DependencyGraphBuilder`.

**Graph types:**

| Type | Trigger | Behavior |
|---|---|---|
| Full graph | No query params | All active services + all dependencies |
| Team graph | `?team=uuid` | Team's services + external services they depend on |
| Service subgraph | `?service=uuid` | Service + recursive upstream traversal |
| Dependency subgraph | `?dependency=uuid` | Owning service's subgraph |

## 6.2 Node Types

**Service nodes:** Real services registered in Depsera. Include health stats (dependency count, healthy/unhealthy counts, last poll status).

**External nodes:** Virtual nodes for dependencies that have no association to a registered service. Created by `ExternalNodeBuilder`:
- Grouped by normalized dependency name (lowercase + trim)
- ID: `external-{SHA256(normalizedName)[0:12]}`
- Multiple dependencies with the same name produce a single external node with aggregated health stats

## 6.3 Service Type Inference

The `ServiceTypeInferencer` assigns a `serviceType` to each service node based on the most common incoming dependency type. For example, if 3 services list a dependency on "postgres-main" as type `database`, the node for "postgres-main" gets `serviceType: "database"`.

For external nodes, the type is inferred from the most common dependency type in the group.

## 6.4 Edge Construction

Edges represent "depends on" relationships. For each dependency:
- If the dependency has an association (`target_service_id`), the edge connects the associated service to the owning service
- If unassociated, the edge connects the external node to the owning service
- Edge ID format: `{sourceId}-{depId}-{type}` — prevents duplicate edges for the same source→target→type combination

## 6.5 Upstream Traversal

The service subgraph uses `traverseUpstream()` to recursively follow dependency associations:
1. Start with the selected service
2. For each dependency with an association, add the associated service and recurse
3. Track visited services to prevent infinite loops from circular dependencies
