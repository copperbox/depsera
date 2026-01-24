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
- API proxy configured in Vite dev server (client requests to `/api/*` forward to backend)

## Database Schema

Core tables:
- `users` - User accounts (OIDC authenticated)
- `teams` - Organizational units that own services
- `team_members` - Junction table for user-team membership
- `services` - Tracked APIs/microservices with health endpoints
- `dependencies` - Dependency status data from proactive-deps
- `dependency_associations` - Links between dependencies and services

Migrations are in `/server/src/db/migrations/`. Types are in `/server/src/db/types.ts`.

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
