# 10. Client Architecture

**[Implemented]**

## 10.1 Routing

| Path | Component | Auth | Description |
|---|---|---|---|
| `/login` | Login | Public | OIDC redirect or local auth form |
| `/` | Dashboard | Protected | Health summary overview |
| `/services` | ServicesList | Protected | Searchable, filterable service list |
| `/services/:id` | ServiceDetail | Protected | Tabbed view (`?tab=`): Overview (metadata, actions), Dependencies (list + detail modal), Dependent Reports (table), Poll Issues. Inline override editing (team lead+/admin), manual poll, inline alias management (admin) |
| `/teams` | TeamsList | Protected | Team listing with counts |
| `/teams/:id` | TeamDetail | Protected | Tabbed view (`?tab=`): Overview (info, edit/delete), Members (add/remove/promote), Manifests (ManifestStatusCard), Services (list), Alerts Config (channels, rules, mutes, history) |
| `/graph` | DependencyGraph | Protected | Interactive React Flow visualization |
| `/associations` | Associations | Protected | Manual association creation, aliases, canonical override management (team lead+/admin) |
| `/wallboard` | Wallboard | Protected | Full-screen status board with dependency detail panel showing resolved contact info and impact with override indicators |
| `/admin/users` | UserManagement | Admin only | User accounts, roles, activation |
| `/admin/settings` | AdminSettings | Admin only | Application-wide settings management |

`ProtectedRoute` component checks `isAuthenticated` (redirects to `/login`) and optionally `isAdmin` (redirects to `/`).

## 10.2 Context Providers

**AuthContext** — wraps the entire app:
```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;   // user !== null
  isAdmin: boolean;            // user?.role === 'admin'
  login: () => void;           // Redirects to /api/auth/login
  logout: () => Promise<void>; // POST /api/auth/logout with CSRF
  checkAuth: () => Promise<void>; // GET /api/auth/me
}
```
On mount, calls `/api/auth/me` to check session. On logout, validates the redirect URL before navigating.

**ThemeContext** — dark mode support:
```typescript
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}
```
Persists to `localStorage` key `theme`. Falls back to system preference (`prefers-color-scheme`). Sets `data-theme` attribute on `<html>`.

## 10.3 API Client Pattern

All API modules follow a consistent pattern:

1. `fetch(url, { credentials: 'include', ... })` — cookie-based auth
2. Mutating requests add `headers: withCsrfToken({ 'Content-Type': 'application/json' })`
3. `handleResponse<T>(response)` — throws `Error` with server message if `!response.ok`, otherwise returns parsed JSON
4. No built-in retry logic — components handle errors via state

**API modules:** `auth.ts`, `services.ts`, `teams.ts`, `users.ts`, `aliases.ts`, `associations.ts`, `graph.ts`, `latency.ts`, `errors.ts`, `dependencies.ts`, `canonicalOverrides.ts`

## 10.4 Custom Hooks

| Hook | Purpose |
|---|---|
| `usePolling` | Auto-refresh with configurable interval (10s, 20s, 30s, 1m). Persists enabled state and interval to localStorage. |
| `useDashboard` | Loads services + teams, computes aggregate stats (total, healthy, warning, critical), team health summaries, issues list, recent activity. |
| `useServicesList` | Loads services + teams with search, team filter, and sortable columns (name, team, status). Distinguishes initial load (`isLoading`) from background refresh (`isRefreshing`). |
| `useServiceDetail` | Loads single service + teams. Handles deletion (redirects to `/services`), manual polling. |
| `useTeamDetail` | Loads team + users. Computes available (non-member) users. Handles deletion. |
| `useTeamMembers` | Member CRUD operations — add, toggle role, remove. Tracks in-progress actions per user. |
| `useGraphState` | Complex state management for React Flow graph. Persists node positions per user, layout direction, tier spacing to localStorage. Smart refresh preserves selection state. High latency detection uses an adaptive algorithm (see §10.6). |
| `useAssociations` | CRUD for associations scoped to a single dependency. |
| `useAliases` | Global alias management — CRUD + canonical names list. |
| `useCanonicalOverrides` | Canonical override CRUD — load all, save (upsert), remove, lookup by canonical name. |
| `useAlertRules` | Loads alert rules for a team. Handles save (upsert) with dirty tracking. Exposes `rules`, `save`, `error`, `isSaving`. |
| `useManifestConfig` | Loads/saves manifest configuration for a team. Handles toggle, sync trigger, sync result state. |
| `useSyncHistory` | Loads paginated sync history for a team manifest. Supports load-more. |
| `useDriftReview` | Loads drift flags for a team. Handles accept, dismiss, reopen, and bulk actions. |

## 10.5 Common Components

### Tabs

Reusable tabbed navigation component (`client/src/components/common/Tabs.tsx`).

```tsx
<Tabs defaultTab="overview" urlParam="tab" storageKey="team-{id}-tab">
  <TabList>
    <Tab value="overview">Overview</Tab>
    <Tab value="members">Members</Tab>
  </TabList>
  <TabPanel value="overview">...</TabPanel>
  <TabPanel value="members">...</TabPanel>
</Tabs>
```

- Tab state is reflected in URL search params (`?tab=members`) for linkability
- Falls back to `localStorage` persistence via `storageKey` prop
- Active tab indicator uses a 2px accent-colored bottom border
- Used by TeamDetail and ServiceDetail pages

### DependencyDetailModal

Modal for viewing dependency details from the ServiceDetail Dependencies tab (`client/src/components/pages/Services/DependencyDetailModal.tsx`). Shows health status, latency chart, contact info, and override section.

## 10.6 Design Token System

The client uses a structured CSS custom property system defined in `client/src/index.css`. All component styles reference these tokens — no hardcoded color, spacing, or timing values.

**Typography:** Inter (body + headings) loaded from Google Fonts with `font-display: swap`. Monospace stack for code/data values.

**Token categories:**
- **Spacing** (theme-independent): `--space-1` (4px) through `--space-8` (64px), 8px base grid
- **Typography** (theme-independent): `--font-xs` through `--font-2xl`, weight tokens (`--font-normal`, `--font-medium`, `--font-semibold`)
- **Border radius** (theme-independent): `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px)
- **Transitions** (theme-independent): `--duration-fast` (150ms), `--duration-normal` (200ms), `--duration-slow` (300ms)
- **Surface colors** (theme-dependent): `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-border-subtle`
- **Text colors** (theme-dependent): `--color-text`, `--color-text-secondary`, `--color-text-muted`
- **Status colors** (same for both themes): `--color-healthy`, `--color-warning`, `--color-critical`, `--color-unknown`
- **Accent** (same for both themes): `--color-accent`, `--color-accent-hover`
- **Shadows** (theme-dependent): `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**Status badge pattern:** Uses `color-mix()` for theme-adaptive tinted backgrounds:
```css
.healthy {
  background-color: color-mix(in srgb, var(--color-healthy) 15%, transparent);
  color: var(--color-healthy);
}
```

**Shared CSS module classes:** `client/src/styles/shared.module.css` provides composable base classes (`.card`, `.buttonPrimary`, `.buttonGhost`, `.input`, `.tableRow`, etc.) used via CSS Modules `composes:` syntax.

**Icons:** All icons use Lucide React SVG components — no emoji or inline SVG.

## 10.7 Client-Side Storage

| Key | Scope | Content |
|---|---|---|
| `theme` | Global | `'light'` or `'dark'` |
| `graph-node-positions-{userId}` | Per user | JSON map of manually dragged node positions |
| `graph-layout-direction` | Global | `'TB'` or `'LR'` |
| `graph-tier-spacing` | Global | Number (50–500, default 150) |
| `{page}-auto-refresh` | Per page | `'true'` or `'false'` |
| `{page}-refresh-interval` | Per page | Interval in ms |
| `wallboard-team-filter` | Wallboard | Selected team ID |
| `wallboard-unhealthy-only` | Wallboard | `'true'` or `'false'` |
| `team-{id}-tab` | Per team | Last active tab on TeamDetail |
| `service-{id}-tab` | Per service | Last active tab on ServiceDetail |

## 10.8 High Latency Detection

The dependency graph automatically flags edges as "high latency" using an adaptive threshold with an absolute floor. No user configuration is required.

**Algorithm:**

```
threshold = max(HIGH_LATENCY_FLOOR_MS, avgLatencyMs24h × HIGH_LATENCY_MULTIPLIER)
```

**Constants:**

| Constant | Value | Purpose |
|---|---|---|
| `HIGH_LATENCY_FLOOR_MS` | 100 | Absolute minimum threshold — latency below 100ms is never flagged |
| `HIGH_LATENCY_MULTIPLIER` | 2 | Relative multiplier — latency must exceed 2× the 24h average |

**Behavior by dependency profile:**

| Dependency | Avg Latency | 2× Avg | Effective Threshold | Why |
|---|---|---|---|---|
| Fast cache (Redis) | 2ms | 4ms | 100ms | Floor prevents false positives on trivially fast services |
| Internal API | 30ms | 60ms | 100ms | Floor still protects — 60ms is fine |
| External API | 80ms | 160ms | 160ms | 2× average wins — 160ms is meaningful degradation |
| Slow DB query | 500ms | 1000ms | 1000ms | 2× average wins — 1s response is genuinely degraded |

The `isHighLatency()` function is a pure utility in `client/src/utils/graphLayout.ts`. It returns `false` when either latency value is null/undefined/zero.

High latency edges are rendered with a warning color (orange), pulsing animation, and a "High Latency" badge in the edge details panel.
