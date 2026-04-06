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

**Service nodes:** Real services registered in Depsera. Include health stats (dependency count, healthy/unhealthy/skipped counts, last poll status). The `skippedCount` field tracks how many dependencies are marked as skipped. Skipped dependencies are excluded from `healthyCount` and `unhealthyCount` but remain in `dependencyCount` (the total).

**External nodes:** Virtual nodes for dependencies that have no association to a registered service. Created by `ExternalNodeBuilder`:
- Grouped by normalized dependency name (lowercase + trim)
- ID: `external-{SHA256(normalizedName)[0:12]}`
- Multiple dependencies with the same name produce a single external node with aggregated health stats
- External nodes can have org-wide enrichment applied from the `external_node_enrichment` table (display name, description, impact, contact, service type override). `GraphService` loads enrichments and applies them via `ExternalNodeBuilder.applyEnrichment()` during graph building.

## 6.3 Service Type Inference

The `ServiceTypeInferencer` assigns a `serviceType` to each service node based on the most common incoming dependency type. For example, if 3 services list a dependency on "postgres-main" as type `database`, the node for "postgres-main" gets `serviceType: "database"`.

For external nodes, the type is inferred from the most common dependency type in the group.

## 6.4 Edge Construction

Edges represent "depends on" relationships. For each dependency:
- If the dependency has an association (`target_service_id`), the edge connects the associated service to the owning service
- If unassociated, the edge connects the external node to the owning service
- Edge data includes `skipped: boolean` — true when the underlying dependency has `skipped = 1`. Skipped edges represent dependencies whose health checks are intentionally not executed.
- Edge data includes `discoverySource?: DiscoverySource` — indicates how the dependency was created (`'manual'`, `'otlp_metric'`, or `'otlp_trace'`)
- Edge data includes `isAutoSuggested?: boolean` — true when the association was automatically created from trace data and has not been confirmed by a user
- Edge data includes `associationId?: string | null` — the association ID, used by confirm/dismiss UI actions
- Edge ID format: `{sourceId}-{depId}-{type}` — prevents duplicate edges for the same source→target→type combination

**Discovery source styling (frontend):**
- **Auto-discovered unconfirmed** (`discoverySource === 'otlp_trace'` and `isAutoSuggested === true`): rendered with dashed line and "Suggested" badge
- **Confirmed or manual**: rendered with solid line (standard treatment)

## 6.5 Upstream Traversal

The service subgraph uses `traverseUpstream()` to recursively follow dependency associations:
1. Start with the selected service
2. For each dependency with an association, add the associated service and recurse
3. Track visited services to prevent infinite loops from circular dependencies

## 6.6 Discovery Source Integration **[Implemented]**

The graph surfaces trace-discovered dependencies with visual distinction from manually-configured ones.

### Graph Edge Data Extensions

`GraphEdgeData` includes:
- `discoverySource?: DiscoverySource` — populated from `dependencies.discovery_source` in `DependencyGraphBuilder.createEdgeData()`
- `isAutoSuggested?: boolean` — populated from `dependency_associations.is_auto_suggested` (true when `is_auto_suggested === 1`)
- `associationId?: string | null` — the association ID for confirm/dismiss actions

Service nodes include:
- `discoveredDependencyCount?: number` — count of trace-discovered dependencies for the service

### Edge Details Panel

The `EdgeDetailsPanel` shows:
- Discovery source badge (manual, OTLP metric, OTLP trace)
- User-enriched name/description/impact with fallback to auto-detected values
- Display name resolution: `user_display_name` → `canonicalName` → `linked_service.name` → `name`
- "Confirm" / "Dismiss" buttons for auto-suggested associations (calls `PUT /api/dependencies/:depId/associations/:assocId/confirm` or `/dismiss`)

### Node Details Panel — External Node Enrichment

When a node `isExternal`, the `NodeDetailsPanel` shows enriched metadata (display name, description, impact, contact) if available from the `external_node_enrichment` table.

### Dependency Queries

`DependencyStore.findAllWithAssociationsAndLatency` and `findByServiceIdsWithAssociationsAndLatency` SELECT `d.discovery_source` and `da.is_auto_suggested`, which flow through `DependencyGraphBuilder.createEdgeData()` into the graph response.
