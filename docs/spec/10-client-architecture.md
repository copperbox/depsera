# 10. Client Architecture

**[Implemented]**

## 10.1 Routing

| Path | Component | Auth | Description |
|---|---|---|---|
| `/login` | Login | Public | OIDC redirect or local auth form |
| `/` | Dashboard | Protected | Health summary overview |
| `/services` | ServicesList | Protected | Searchable, filterable service list |
| `/services/:id` | ServiceDetail | Protected | Dependencies, latency, errors, contact info, override indicators, inline override editing (team lead+/admin), manual poll |
| `/teams` | TeamsList | Protected | Team listing with counts |
| `/teams/:id` | TeamDetail | Protected | Members, roles, owned services |
| `/graph` | DependencyGraph | Protected | Interactive React Flow visualization |
| `/associations` | Associations | Protected | Suggestions inbox, manual creation, aliases |
| `/wallboard` | Wallboard | Protected | Full-screen status board |
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

**API modules:** `auth.ts`, `services.ts`, `teams.ts`, `users.ts`, `aliases.ts`, `associations.ts`, `graph.ts`, `latency.ts`, `errors.ts`, `dependencies.ts`

## 10.4 Custom Hooks

| Hook | Purpose |
|---|---|
| `usePolling` | Auto-refresh with configurable interval (10s, 20s, 30s, 1m). Persists enabled state and interval to localStorage. |
| `useDashboard` | Loads services + teams, computes aggregate stats (total, healthy, warning, critical), team health summaries, issues list, recent activity. |
| `useServicesList` | Loads services + teams with search and team filter. Distinguishes initial load (`isLoading`) from background refresh (`isRefreshing`). |
| `useServiceDetail` | Loads single service + teams. Handles deletion (redirects to `/services`), manual polling. |
| `useTeamDetail` | Loads team + users. Computes available (non-member) users. Handles deletion. |
| `useTeamMembers` | Member CRUD operations — add, toggle role, remove. Tracks in-progress actions per user. |
| `useGraphState` | Complex state management for React Flow graph. Persists node positions per user, layout direction, tier spacing, latency threshold to localStorage. Smart refresh preserves selection state. |
| `useAssociations` | CRUD for associations scoped to a single dependency. |
| `useAliases` | Global alias management — CRUD + canonical names list. |
| `useSuggestions` | Suggestion inbox — list, filter, multi-select, accept/dismiss (individual and bulk). |

## 10.5 Client-Side Storage

| Key | Scope | Content |
|---|---|---|
| `theme` | Global | `'light'` or `'dark'` |
| `graph-node-positions-{userId}` | Per user | JSON map of manually dragged node positions |
| `graph-layout-direction` | Global | `'TB'` or `'LR'` |
| `graph-tier-spacing` | Global | Number (50–500, default 150) |
| `graph-latency-threshold` | Global | Number (0–100, default 80) |
| `{page}-auto-refresh` | Per page | `'true'` or `'false'` |
| `{page}-refresh-interval` | Per page | Interval in ms |
| `wallboard-team-filter` | Wallboard | Selected team ID |
| `wallboard-unhealthy-only` | Wallboard | `'true'` or `'false'` |
