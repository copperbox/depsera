# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dependencies Dashboard - A dashboard to review and manage all tracked dependencies and services.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + CSS Modules (`/client`)
- **Backend:** Express.js + TypeScript + SQLite (`/server`)
- **Testing:** Jest + React Testing Library
- **Package Manager:** npm

## Build Commands

```bash
# Install all dependencies
npm run install:all

# Development (runs both server and client)
npm run dev

# Run individually
npm run dev:server    # Backend on port 3001
npm run dev:client    # Frontend on port 3000 (proxies /api to backend)

# Testing
npm test              # Run all tests
npm run test:server   # Server tests only
npm run test:client   # Client tests only

# Linting
npm run lint          # Lint both packages

# Building
npm run build         # Build both packages
```

## Database Commands

```bash
# Run from /server directory
npm run db:migrate    # Run pending migrations
npm run db:rollback   # Rollback last migration
npm run db:status     # Show migration status
npm run db:seed       # Seed with development data
npm run db:clear      # Clear all data (dangerous!)
```

## Architecture

- `/client` - React SPA with Vite, routes via react-router-dom
- `/server` - Express REST API, SQLite database in `/server/data/`
- `/server/src/middleware/` - Express middleware (static file serving, compression)
- API proxy configured in Vite dev server (client requests to `/api/*` forward to backend)
- In production, Express serves the built client from `client/dist/` with compression and SPA catch-all routing (auto-detected)

## Database Schema

Core tables:
- `users` - User accounts (OIDC authenticated)
- `teams` - Organizational units that own services
- `team_members` - Junction table for user-team membership
- `services` - Tracked APIs/microservices with health endpoints
- `dependencies` - Dependency status data from proactive-deps (has `canonical_name` column for alias resolution)
- `dependency_associations` - Links between dependencies and services
- `dependency_aliases` - Maps reported dependency names (alias) to canonical names
- `dependency_latency_history` - Historical latency data points per dependency
- `dependency_error_history` - Historical error records per dependency

Migrations are in `/server/src/db/migrations/` (001-006). Types are in `/server/src/db/types.ts`.

## Client-Side Storage

- `graph-node-positions-{userId}` — Persisted node positions for manually dragged graph nodes (per user)
- `graph-layout-direction` — Graph layout direction (TB/LR)
- `graph-tier-spacing` — Graph tier spacing value
- `graph-latency-threshold` — High latency threshold percentage

## Store Registry

All data access goes through `StoreRegistry` (`/server/src/stores/index.ts`). Stores:
- `services`, `teams`, `users`, `dependencies`, `associations`, `latencyHistory`, `errorHistory`, `aliases`

Interfaces in `/server/src/stores/interfaces/`, implementations in `/server/src/stores/impl/`.

## API Routes

- `/api/auth` - OIDC authentication
- `/api/services` - CRUD + manual polling
- `/api/teams` - CRUD + member management
- `/api/users` - Admin user management
- `/api/aliases` - Dependency alias CRUD + canonical name lookup
- `/api/dependencies/:id/associations` - Association CRUD
- `/api/associations/suggestions` - Auto-suggestion management
- `/api/graph` - Dependency graph data
- `/api/latency/:id` - Latency history
- `/api/errors/:id` - Error history

## General Guidance

- Unless answers are already specified, always ask clarifying questions when there are decisions to be made.
- When encountering important decisions regarding **file structure**, **infrastructure**, **UI behavior**, or other architectural concerns, always:
  1. Pause and ask for direction
  2. Present the available options with pros/cons
  3. Wait for confirmation before proceeding

## Linear Workflow

When working on a Linear ticket:
1. Set the issue status to "In Progress" when starting work
2. Upon completing the work, update the issue status to "Done" (or the appropriate completed state)
3. Add a brief comment summarizing what was done if the changes differ from the original requirements

Always update the ticket status - do not leave tickets in "In Progress" after completing work.

## Linear Issue Template

When creating or updating Linear issues for this project, use this structure:

### Title Format
`[Area] Brief action-oriented description`

Examples:
- `[API] Add endpoint for fetching dependency versions`
- `[UI] Create dependency table component`
- `[Bug] Fix pagination in services list`

### Description Structure

```markdown
## Context
Why this work is needed. Link to related issues or discussions if applicable.

## Requirements
- [ ] Specific deliverable 1
- [ ] Specific deliverable 2
- [ ] Specific deliverable 3

## Technical Notes
Implementation details, constraints, or architectural decisions relevant to this work.
Optional - include only when helpful.

## Out of Scope
What this issue explicitly does NOT cover (if clarification is needed).
```

### Labels
Apply relevant labels:
- `bug` - Something isn't working
- `feature` - New functionality
- `enhancement` - Improvement to existing functionality
- `tech-debt` - Refactoring or cleanup
- `documentation` - Documentation updates

### Linking
- Use `blocks` for issues that must complete before others can start
- Use `blocked by` for dependencies on other issues
- Use `related to` for contextually connected work
