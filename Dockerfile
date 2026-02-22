# ---- Stage 1: Build ----
FROM node:22-slim AS build

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Install root dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Install client dependencies
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

# Copy source code
COPY server/ ./server/
COPY client/ ./client/

# Build server (TypeScript -> JavaScript)
RUN cd server && npm run build

# Build client (Vite production bundle)
RUN cd client && npm run build

# ---- Stage 2: Production ----
FROM node:22-slim

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy server production dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built server
COPY --from=build /app/server/dist ./server/dist

# Copy built client
COPY --from=build /app/client/dist ./client/dist

# Create data directory for SQLite volume mount
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data

# Use non-root user
USER node

EXPOSE 3001

VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "server/dist/index.js"]
