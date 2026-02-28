import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  useOnSelectionChange,
  useReactFlow,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { getServiceHealthStatus } from '../../../types/graph';
import { ServiceNode } from './ServiceNode';
import { CustomEdge } from './CustomEdge';
import { AnimationContext } from './AnimationContext';
import { NodeDetailsPanel } from './NodeDetailsPanel';
import { EdgeDetailsPanel } from './EdgeDetailsPanel';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import { useGraphState } from '../../../hooks/useGraphState';
import { useAuth } from '../../../contexts/AuthContext';
import {
  type AppNode,
  type AppEdge,
  type LayoutDirection,
  isHighLatency,
} from '../../../utils/graphLayout';
import type { EdgeStyle } from '../../../types/graph';
import {
  getRelatedNodeIds,
  getRelatedNodeIdsFromEdge,
  getRelatedEdgeIds,
  type IsolationTarget,
} from '../../../utils/graphTraversal';
import styles from './DependencyGraph.module.css';

const nodeTypes = {
  service: ServiceNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

/* istanbul ignore next -- @preserve
   DependencyGraphInner is the main ReactFlow graph component that uses ReactFlow hooks
   (useOnSelectionChange), ReactFlow components (ReactFlow, Controls, MiniMap, Background),
   and ReactFlow event handlers. Unit testing this component would require mocking
   ReactFlow's entire context, state management, and rendering pipeline.

   Additionally, this component:
   - Uses useOnSelectionChange which only works inside ReactFlowProvider
   - Uses onNodesChange/onEdgesChange callbacks tied to ReactFlow's internal state
   - Renders ReactFlow which requires actual DOM measurements for layout

   Integration tests with Cypress/Playwright are the appropriate testing strategy
   for this component. The supporting hooks (useGraphState, usePolling) and utilities
   (graphTraversal, graphLayout) have comprehensive unit test coverage. */
function DependencyGraphInner() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read isolation URL params (isolateService, isolateDep, or legacy dependency)
  const isolateServiceParam = searchParams.get('isolateService');
  const isolateDepParam = searchParams.get('isolateDep');
  const legacyDepParam = searchParams.get('dependency');

  const initialIsolationTarget = useMemo((): IsolationTarget | null => {
    if (isolateServiceParam) return { type: 'service', id: isolateServiceParam };
    if (isolateDepParam) return { type: 'dependency', id: isolateDepParam };
    if (legacyDepParam) return { type: 'dependency', id: legacyDepParam };
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    teams,
    selectedTeam,
    setSelectedTeam,
    searchQuery,
    setSearchQuery,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    layoutDirection,
    setLayoutDirection,
    edgeStyle,
    setEdgeStyle,
    dashedAnimation,
    setDashedAnimation,
    packetAnimation,
    setPacketAnimation,
    isolationTarget,
    setIsolationTarget,
    exitIsolation,
    layoutVersion,
    isLoading,
    isRefreshing,
    error,
    loadData,
    resetLayout,
  } = useGraphState({ userId: user?.id, initialIsolationTarget });

  // Sync isolation state to URL
  const skipUrlSyncRef = useRef(true);
  useEffect(() => {
    // Skip first render (URL already has the params)
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (isolationTarget?.type === 'service') {
      params.set('isolateService', isolationTarget.id);
    } else if (isolationTarget?.type === 'dependency') {
      params.set('isolateDep', isolationTarget.id);
    }
    setSearchParams(params, { replace: true });
  }, [isolationTarget, setSearchParams]);

  // Re-center viewport after layout completes (isolation enter/exit, re-layout)
  const { fitView } = useReactFlow();
  const initialLayoutVersionRef = useRef(layoutVersion);
  useEffect(() => {
    // Skip the initial layout — ReactFlow's fitView prop handles that
    if (layoutVersion === initialLayoutVersionRef.current) return;
    // Wait for ReactFlow to render the new nodes before fitting
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300 });
    });
  }, [layoutVersion, fitView]);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // Close settings menu on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  // Initial load and team/direction/edge style change
  useEffect(() => {
    loadData();
  }, [selectedTeam, layoutDirection, edgeStyle]);

  // Polling hook
  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'graph',
    onPoll: useCallback(() => {
      loadData(true);
    }, [loadData]),
  });

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(e.target.value);
  };

  const handleDirectionChange = (direction: LayoutDirection) => {
    setLayoutDirection(direction);
  };

  const handleEdgeStyleChange = (style: EdgeStyle) => {
    setEdgeStyle(style);
  };

  // Get the selected node's data for the details panel
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Get related node IDs when a node or edge is selected
  const relatedNodeIds = useMemo(() => {
    if (selectedNodeId) {
      return getRelatedNodeIds(selectedNodeId, edges);
    }
    if (selectedEdgeId) {
      return getRelatedNodeIdsFromEdge(selectedEdgeId, edges);
    }
    return null;
  }, [selectedNodeId, selectedEdgeId, edges]);

  // Get related edge IDs based on selection
  const relatedEdgeIds = useMemo(() => {
    if (!selectedNodeId && !selectedEdgeId) return null;
    return getRelatedEdgeIds(selectedNodeId, selectedEdgeId, edges);
  }, [selectedNodeId, selectedEdgeId, edges]);

  // Get hovered node's related nodes/edges (only when nothing is selected)
  const hoveredRelatedNodeIds = useMemo(() => {
    if (!hoveredNodeId || selectedNodeId || selectedEdgeId) return null;
    return getRelatedNodeIds(hoveredNodeId, edges);
  }, [hoveredNodeId, selectedNodeId, selectedEdgeId, edges]);

  const hoveredRelatedEdgeIds = useMemo(() => {
    if (!hoveredNodeId || selectedNodeId || selectedEdgeId) return null;
    return getRelatedEdgeIds(hoveredNodeId, null, edges);
  }, [hoveredNodeId, selectedNodeId, selectedEdgeId, edges]);

  // Filter nodes based on search query and selection
  const filteredNodes = useMemo(() => {
    let result = nodes;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchingIds = new Set<string>();

      nodes.forEach((node) => {
        if (node.data.name.toLowerCase().includes(query)) {
          matchingIds.add(node.id);
        }
        if (node.data.teamName?.toLowerCase().includes(query)) {
          matchingIds.add(node.id);
        }
      });

      result = nodes.map((node) => ({
        ...node,
        style: matchingIds.has(node.id)
          ? { opacity: 1 }
          : { opacity: 0.3 },
      }));
    }

    // Apply selection highlighting
    if (relatedNodeIds) {
      result = result.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
        },
        style: relatedNodeIds.has(node.id)
          ? { ...(node.style || {}), opacity: 1 }
          : { ...(node.style || {}), opacity: 0.2 },
      }));
    }

    // Apply hover highlighting (only when nothing is selected)
    if (hoveredRelatedNodeIds) {
      result = result.map((node) => ({
        ...node,
        style: hoveredRelatedNodeIds.has(node.id)
          ? { ...(node.style || {}), opacity: 1 }
          : { ...(node.style || {}), opacity: 0.15 },
      }));
    }

    return result;
  }, [nodes, searchQuery, relatedNodeIds, selectedNodeId, hoveredRelatedNodeIds]);

  // Filter edges based on selection
  const filteredEdges = useMemo((): AppEdge[] => {
    const processEdge = (edge: AppEdge, isSelected: boolean, isHighlighted: boolean, opacity: number): AppEdge => {
      const edgeIsHighLatency = isHighLatency(edge.data?.latencyMs, edge.data?.avgLatencyMs24h);
      return {
        ...edge,
        data: {
          ...edge.data!,
          isSelected,
          isHighlighted,
          isHighLatency: edgeIsHighLatency,
        },
        style: { opacity },
      };
    };

    if (!relatedEdgeIds) {
      // Apply hover highlighting if active (no selection)
      if (hoveredRelatedEdgeIds) {
        return edges.map((edge) => {
          const isHoverRelated = hoveredRelatedEdgeIds.has(edge.id);
          return isHoverRelated
            ? processEdge(edge, false, false, 1)
            : { ...processEdge(edge, false, false, 0), style: { opacity: 0, pointerEvents: 'none' as const } };
        });
      }
      return edges.map((edge) => processEdge(edge, false, false, 1));
    }

    return edges.map((edge) => {
      const isRelated = relatedEdgeIds.has(edge.id);
      const isSelected = edge.id === selectedEdgeId;
      return isRelated
        ? processEdge(edge, isSelected, !isSelected, 1)
        : { ...processEdge(edge, false, false, 0), style: { opacity: 0, pointerEvents: 'none' as const } };
    });
  }, [edges, relatedEdgeIds, selectedEdgeId, hoveredRelatedEdgeIds]);

  // Get the selected edge's data for the details panel
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return filteredEdges.find((e) => e.id === selectedEdgeId) || null;
  }, [filteredEdges, selectedEdgeId]);

  // Memoize animation settings so CustomEdge components only re-render
  // when the flags actually change, not on every data refresh.
  const animationSettings = useMemo(
    () => ({ dashedAnimation, packetAnimation }),
    [dashedAnimation, packetAnimation],
  );

  // Handle node selection change
  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      if (selectedNodes.length > 0) {
        setSelectedNodeId(selectedNodes[0].id);
        setSelectedEdgeId(null);
      } else {
        setSelectedNodeId(null);
      }
    },
  });

  // Handle edge click
  const handleEdgeClick: EdgeMouseHandler<AppEdge> = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, [setSelectedEdgeId, setSelectedNodeId]);

  // Handle node hover (highlight connections when nothing is selected)
  const handleNodeMouseEnter: NodeMouseHandler<AppNode> = useCallback((_, node) => {
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler<AppNode> = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Handle pane click (deselect all, close context menu)
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  // Handle right-click context menu on nodes
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: AppNode) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const getMiniMapNodeColor = (node: AppNode) => {
    const status = getServiceHealthStatus(node.data);

    switch (status) {
      case 'healthy':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'critical':
        return '#dc2626';
      default:
        return '#9ca3af';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading dependency graph...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span>{error}</span>
          <button className={styles.retryButton} onClick={() => loadData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <label className={styles.toolbarLabel}>Team:</label>
          <select
            className={styles.select}
            value={selectedTeam}
            onChange={handleTeamChange}
          >
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarGroup}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isolationTarget && (
          <div className={styles.toolbarGroup}>
            <button
              className={styles.exitIsolationButton}
              onClick={exitIsolation}
              title="Exit isolated view and show all nodes"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Show full graph
            </button>
          </div>
        )}

        <div className={styles.toolbarRight}>
          {isRefreshing && (
            <div className={styles.refreshingIndicator}>
              <div className={styles.spinnerSmall} />
            </div>
          )}

          <div className={styles.legendWrapper}>
            <button
              className={styles.legendButton}
              title="Legend"
              aria-label="Show legend"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
            <div className={styles.legendTooltip}>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.healthy}`} />
                <span>Healthy</span>
              </div>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.warning}`} />
                <span>Warning</span>
              </div>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.critical}`} />
                <span>Critical</span>
              </div>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.unknown}`} />
                <span>Unknown</span>
              </div>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.skipped}`} />
                <span>Skipped</span>
              </div>
              <div className={styles.legendItem}>
                <div className={`${styles.legendDot} ${styles.highLatency}`} />
                <span>High Latency</span>
              </div>
            </div>
          </div>

          <div className={styles.settingsWrapper} ref={settingsRef}>
            <button
              className={styles.settingsButton}
              onClick={() => setSettingsOpen((prev) => !prev)}
              title="Graph settings"
              aria-label="Graph settings"
              aria-expanded={settingsOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {settingsOpen && (
              <div className={styles.settingsMenu}>
                <div className={styles.settingsMenuItem}>
                  <label className={styles.settingsMenuLabel}>Layout</label>
                  <div className={styles.directionToggle}>
                    <button
                      className={`${styles.directionButton} ${layoutDirection === 'TB' ? styles.directionActive : ''}`}
                      onClick={() => handleDirectionChange('TB')}
                      title="Top to Bottom"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M12 3v18M12 21l-4-4M12 21l4-4" />
                      </svg>
                    </button>
                    <button
                      className={`${styles.directionButton} ${layoutDirection === 'LR' ? styles.directionActive : ''}`}
                      onClick={() => handleDirectionChange('LR')}
                      title="Left to Right"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M3 12h18M21 12l-4-4M21 12l-4 4" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className={styles.settingsMenuItem}>
                  <label className={styles.settingsMenuLabel}>Edges</label>
                  <div className={styles.directionToggle}>
                    <button
                      className={`${styles.directionButton} ${edgeStyle === 'orthogonal' ? styles.directionActive : ''}`}
                      onClick={() => handleEdgeStyleChange('orthogonal')}
                      title="Orthogonal edges"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M4 4v8h16v8" />
                      </svg>
                    </button>
                    <button
                      className={`${styles.directionButton} ${edgeStyle === 'bezier' ? styles.directionActive : ''}`}
                      onClick={() => handleEdgeStyleChange('bezier')}
                      title="Bezier curve edges"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M4 4c0 12 16 4 16 16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className={styles.settingsMenuItem}>
                  <button
                    className={styles.toolbarButton}
                    onClick={resetLayout}
                    title="Reset to auto-layout"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M1 4v6h6M23 20v-6h-6" />
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                    </svg>
                    Reset Layout
                  </button>
                </div>

                <div className={styles.settingsMenuDivider} />

                <div className={styles.settingsMenuItem}>
                  <span className={styles.settingsMenuLabel}>Dashed edges</span>
                  <button
                    role="switch"
                    aria-checked={dashedAnimation}
                    onClick={() => setDashedAnimation(!dashedAnimation)}
                    className={`${styles.togglePill} ${dashedAnimation ? styles.toggleActive : ''}`}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>

                <div className={styles.settingsMenuItem}>
                  <span className={styles.settingsMenuLabel}>Packets</span>
                  <button
                    role="switch"
                    aria-checked={packetAnimation}
                    onClick={() => setPacketAnimation(!packetAnimation)}
                    className={`${styles.togglePill} ${packetAnimation ? styles.toggleActive : ''}`}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>

                <div className={styles.settingsMenuDivider} />

                <div className={styles.settingsMenuItem}>
                  <span className={styles.autoRefreshLabel}>Auto-refresh</span>
                  <div className={styles.autoRefreshControls}>
                    <button
                      role="switch"
                      aria-checked={isPollingEnabled}
                      onClick={togglePolling}
                      className={`${styles.togglePill} ${isPollingEnabled ? styles.toggleActive : ''}`}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                    <select
                      value={pollingInterval}
                      onChange={handleIntervalChange}
                      className={styles.intervalSelect}
                      disabled={!isPollingEnabled}
                      aria-label="Refresh interval"
                    >
                      {INTERVAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.graphWrapper}>
          {filteredNodes.length === 0 ? (
            <div className={styles.emptyState}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
              <span>No services or dependencies to display</span>
            </div>
          ) : (
            <AnimationContext.Provider value={animationSettings}>
            <ReactFlow
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              onNodeMouseEnter={handleNodeMouseEnter}
              onNodeMouseLeave={handleNodeMouseLeave}
              onNodeContextMenu={handleNodeContextMenu}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              defaultEdgeOptions={{
                type: 'custom',
              }}
            >
              <Controls />
              <MiniMap
                nodeColor={getMiniMapNodeColor}
                maskColor="rgba(0, 0, 0, 0.1)"
                pannable
                zoomable
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />

              {/* Custom marker, filter, and gradient definitions */}
              <svg>
                <defs>
                  <marker
                    id="arrow-dependency"
                    viewBox="0 0 10 10"
                    refX="10"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
                  </marker>
                  <filter id="packet-glow" x="-200%" y="-200%" width="500%" height="500%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <radialGradient id="packet-highlight">
                    <stop offset="0%" stopColor="white" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="white" stopOpacity={0} />
                  </radialGradient>
                </defs>
              </svg>
            </ReactFlow>
            </AnimationContext.Provider>
          )}
        </div>

        {selectedNode && (
          <NodeDetailsPanel
            nodeId={selectedNode.id}
            data={selectedNode.data}
            nodes={nodes}
            edges={edges}
            onClose={() => setSelectedNodeId(null)}
            onIsolate={(serviceId) => setIsolationTarget({ type: 'service', id: serviceId })}
          />
        )}

        {selectedEdge && selectedEdge.data && (
          <EdgeDetailsPanel
            edgeId={selectedEdge.id}
            data={selectedEdge.data}
            sourceNode={nodes.find((n) => n.id === selectedEdge.source)}
            targetNode={nodes.find((n) => n.id === selectedEdge.target)}
            onClose={() => setSelectedEdgeId(null)}
            onIsolate={(depId) => setIsolationTarget({ type: 'dependency', id: depId })}
          />
        )}

        {contextMenu && (
          <div
            className={styles.contextMenu}
            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className={styles.contextMenuItem}
              onClick={() => {
                setIsolationTarget({ type: 'service', id: contextMenu.nodeId });
                setContextMenu(null);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Isolate tree
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* istanbul ignore next -- @preserve
   DependencyGraph is a simple wrapper that provides ReactFlowProvider context.
   Cannot be unit tested without ReactFlow's full context infrastructure. */
export function DependencyGraph() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  );
}
