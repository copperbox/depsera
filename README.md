# Dependencies Dashboard

A dashboard to review and manage all tracked dependencies and services.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, CSS Modules
- **Backend:** Express.js, TypeScript, SQLite
- **Testing:** Jest, React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install all dependencies (root, server, and client)
npm run install:all
```

### Development

```bash
# Run both server and client in development mode
npm run dev

# Or run them separately:
npm run dev:server  # Starts backend on http://localhost:3001
npm run dev:client  # Starts frontend on http://localhost:3000
```

### Testing

```bash
# Run all tests
npm test

# Run tests for a specific package
npm run test:server
npm run test:client
```

### Building

```bash
# Build both packages
npm run build
```

### Linting

```bash
# Lint all packages
npm run lint
```

## Project Structure

```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/          # Express backend
│   ├── src/
│   │   ├── db/
│   │   ├── routes/
│   │   └── index.ts
│   └── package.json
└── package.json     # Root scripts
```
