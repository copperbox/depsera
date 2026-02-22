# Contributing to Depsera

Thank you for your interest in contributing to Depsera! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Contributor License Agreement

By submitting a pull request, you agree to the terms of our [Contributor License Agreement](CLA.md).

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Development Setup

```bash
# Clone the repository
git clone https://github.com/dantheuber/depsera.git
cd depsera

# Install all dependencies (root, server, and client)
npm run install:all

# Copy and configure environment variables
cp server/.env.example server/.env

# Run database migrations
cd server && npm run db:migrate && cd ..

# Start development servers
npm run dev
```

This starts the Vite dev server on `http://localhost:3000` (proxies `/api/*` to the backend) and Express on `http://localhost:3001`.

For detailed configuration options, see the [README](README.md#configuration).

## How to Contribute

### Reporting Bugs

Open a [bug report](https://github.com/dantheuber/depsera/issues/new?template=bug_report.md) with:

- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node.js version, browser)

### Suggesting Features

Open a [feature request](https://github.com/dantheuber/depsera/issues/new?template=feature_request.md) describing the problem you want to solve and your proposed solution.

### Submitting Changes

1. Fork the repository and create a branch from `main`
2. Make your changes following the code style guidelines below
3. Write or update tests for your changes
4. Run the full test suite and linter to ensure everything passes
5. Submit a pull request

## Code Style

### General

- Write code for long-term maintainability and readability
- Keep files focused on a single responsibility
- Prefer explicit named imports over wildcard or barrel re-exports
- Avoid over-engineering — only add what is directly needed

### TypeScript

- Use TypeScript strict mode (both client and server are configured for this)
- Prefer `interface` over `type` for object shapes
- Use descriptive variable and function names

### CSS

- Use CSS Modules for component-specific styles (`*.module.css`)
- Use CSS custom properties (defined in `client/src/index.css`) for theming and colors

### Linting

```bash
npm run lint
```

Both client and server use ESLint. The server also includes `eslint-plugin-security` for static security analysis. All code must pass linting before merge.

## Testing

Every change must include corresponding tests.

```bash
# Run all tests
npm test

# Server tests only
npm run test:server

# Client tests only
npm run test:client
```

- **Server:** Jest with integration tests (including OIDC flow tests using `oidc-provider`)
- **Client:** Jest with React Testing Library

## Project Structure

| Directory | Description |
|-----------|-------------|
| `client/` | React 18 + TypeScript + Vite SPA |
| `server/` | Express.js + TypeScript + SQLite REST API |
| `docs/` | Installation guide, API reference, specs |

For detailed architecture information, see the [README](README.md#architecture).

## Security

If you discover a security vulnerability, please **do not** open a public issue. Instead, email [dan.avila7@gmail.com](mailto:dan.avila7@gmail.com) with details so it can be addressed responsibly.

When contributing code, keep in mind:

- Validate all user input at system boundaries
- Use parameterized queries (never interpolate user input into SQL)
- Use `validateOrderBy()` for any new store methods accepting sort parameters
- Run health endpoint URLs through SSRF validation
- Sanitize error messages before returning them to clients

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Fill out the pull request template completely
3. All CI checks (tests, lint) must pass
4. At least one maintainer review is required before merge
5. Squash commits into a clean history when merging

## Questions?

If you're unsure about anything, open an issue or start a discussion. We're happy to help.
