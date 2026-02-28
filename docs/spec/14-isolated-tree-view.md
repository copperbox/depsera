# 14. Isolated Dependency Tree View

**[Implemented]** — DPS-40

## 14.1 Overview

The graph page currently highlights a selected node's dependency tree while dimming unrelated nodes. This feature replaces the dimming behavior with full isolation — only the relevant dependency tree is rendered, and all unrelated nodes and edges are removed from the view.

## 14.2 Isolation Scope

**From a node:** The isolated view includes the selected node, its full upstream tree (everything it depends on, recursively), and its full downstream tree (everything that depends on it, recursively).

**From an edge:** The isolated view includes the source node's downstream tree, the target node's upstream tree, and both the source and target nodes themselves.

**From an external node:** External nodes have no upstream dependencies. The isolated view shows the external node plus all downstream services that depend on it.

## 14.3 Entry Points

| Entry Point | Trigger | URL Effect |
|---|---|---|
| Wallboard "View in Graph" link | Click link in `DependencyDetailPanel` | Navigate to `/graph?isolateDep={dependencyId}` |
| Node details panel | "Isolate tree" button in `NodeDetailsPanel` | Update URL to `?isolateService={serviceId}` |
| Edge details panel | "Isolate tree" button in `EdgeDetailsPanel` | Update URL to `?isolateDep={dependencyId}` |
| Right-click context menu | Context menu option on any graph node | Update URL to `?isolateService={serviceId}` |

The Wallboard's "View in Graph" link changes from the current highlighting behavior to always isolating.

## 14.4 Exiting Isolation

A "Show full graph" button is placed **to the right of the existing team/text filter inputs** in the graph toolbar. Clicking it:

1. Clears the isolation state
2. Removes `isolateService` / `isolateDep` query params from the URL
3. Returns to the full graph (team filter is not automatically re-applied — the user selects a team again if desired)

The button is only visible when isolation is active.

## 14.5 Re-isolation

While in an isolated view, the user can isolate a different node or edge. This replaces the current isolation entirely — the new tree is computed, the graph re-renders with only the new tree's nodes/edges, and the URL updates accordingly.

## 14.6 Team Filter Interaction

Entering isolation mode **clears the active team filter**. The isolated tree may span multiple teams, so team scoping does not apply during isolation. When the user exits isolation, the team filter resets to "All teams."

## 14.7 Layout Behavior

When entering or exiting isolation, the ELK layout algorithm re-runs on the visible node set so the graph fills the available viewport naturally. Saved manual node positions (localStorage) are not applied during isolation — the auto-layout is always used for isolated views.

## 14.8 URL Deep Linking

Two query parameters support deep linking into isolated views:

| Parameter | Value | Behavior |
|---|---|---|
| `isolateService` | Service UUID | Fetch full graph, isolate the service's upstream + downstream tree |
| `isolateDep` | Dependency UUID | Fetch dependency subgraph, isolate the owning service's tree |

Both parameters work for tracked services and external (unassociated) nodes. When the page loads with either parameter, the graph enters isolation mode immediately.

These parameters are **not cleared on read** (unlike the current `dependency` param) — they persist in the URL so the view is shareable and bookmarkable.

## 14.9 Data Fetching

Isolation does **not** change the data fetching strategy. The full graph (or team graph) is still fetched from `GET /api/graph`. Isolation is a **client-side filter** — the client computes the relevant tree using the existing `getUpstreamNodeIds()`, `getDownstreamNodeIds()`, and `getRelatedNodeIds()` traversal utilities, then renders only those nodes and edges.

For `isolateDep`, the existing `?dependency={id}` API mode is used to fetch the dependency's subgraph, then isolation is applied client-side on that result.

## 14.10 Implementation Notes

### State Management

A new `isolationTarget` state in `useGraphState`:
- `null` — no isolation active (default)
- `{ type: 'service', id: string }` — isolating a service node
- `{ type: 'dependency', id: string }` — isolating from a dependency/edge

### Node/Edge Filtering

When `isolationTarget` is set:
1. Compute the relevant node IDs using traversal utilities
2. Filter `nodes` and `edges` arrays to only include matching items
3. Run ELK layout on the filtered set
4. Render the result

### Context Menu

Add a right-click context menu to graph nodes with an "Isolate tree" option. This can use React Flow's `onNodeContextMenu` handler.

### Migration from Current Behavior

The existing `?dependency=` query parameter behavior (navigate + highlight + auto-select) is replaced by `?isolateDep=` (navigate + isolate). The `?dependency=` parameter should be treated as an alias for `?isolateDep=` for backwards compatibility, then removed in a future release.
