import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('Docker configuration', () => {
  let dockerfile: string;
  let dockerCompose: string;
  let dockerignore: string;

  beforeAll(() => {
    dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf-8');
    dockerCompose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf-8');
    dockerignore = fs.readFileSync(path.join(repoRoot, '.dockerignore'), 'utf-8');
  });

  describe('Dockerfile', () => {
    it('uses multi-stage build', () => {
      const fromStatements = dockerfile.match(/^FROM\s+/gm);
      expect(fromStatements).not.toBeNull();
      expect(fromStatements!.length).toBeGreaterThanOrEqual(2);
    });

    it('uses node:22-slim as base images', () => {
      expect(dockerfile).toContain('FROM node:22-slim');
    });

    it('has a build stage and production stage', () => {
      expect(dockerfile).toMatch(/FROM\s+node:22-slim\s+AS\s+build/);
      // Second FROM is the production stage (no AS alias needed)
      const fromLines = dockerfile.match(/^FROM\s+.+$/gm);
      expect(fromLines).not.toBeNull();
      expect(fromLines!.length).toBe(2);
    });

    it('sets NODE_ENV=production', () => {
      expect(dockerfile).toContain('ENV NODE_ENV=production');
    });

    it('exposes port 3001', () => {
      expect(dockerfile).toContain('EXPOSE 3001');
    });

    it('defines a volume for SQLite data', () => {
      expect(dockerfile).toMatch(/VOLUME.*\/app\/server\/data/);
    });

    it('includes a health check using /api/health', () => {
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('/api/health');
    });

    it('runs as non-root user', () => {
      expect(dockerfile).toContain('USER node');
    });

    it('installs build tools for native modules in build stage', () => {
      // better-sqlite3 needs python3, make, g++
      expect(dockerfile).toContain('python3');
      expect(dockerfile).toContain('make');
      expect(dockerfile).toContain('g++');
    });

    it('uses npm ci for deterministic installs', () => {
      expect(dockerfile).toContain('npm ci');
    });

    it('installs production-only deps in the runtime stage', () => {
      // After the second FROM, there should be npm ci --omit=dev
      const productionStageStart = dockerfile.lastIndexOf('FROM node:22-slim');
      const productionStage = dockerfile.substring(productionStageStart);
      expect(productionStage).toContain('npm ci --omit=dev');
    });

    it('copies built server and client artifacts from build stage', () => {
      expect(dockerfile).toMatch(/COPY\s+--from=build\s+\/app\/server\/dist/);
      expect(dockerfile).toMatch(/COPY\s+--from=build\s+\/app\/client\/dist/);
    });

    it('builds both server and client in build stage', () => {
      const buildStageEnd = dockerfile.lastIndexOf('FROM node:22-slim');
      const buildStage = dockerfile.substring(0, buildStageEnd);
      expect(buildStage).toContain('npm run build');
    });

    it('starts the server with node command', () => {
      expect(dockerfile).toMatch(/CMD.*node.*server\/dist\/index\.js/);
    });

    it('installs curl for health check in runtime stage', () => {
      const productionStageStart = dockerfile.lastIndexOf('FROM node:22-slim');
      const productionStage = dockerfile.substring(productionStageStart);
      expect(productionStage).toContain('curl');
    });
  });

  describe('docker-compose.yml', () => {
    it('defines a depsera service', () => {
      expect(dockerCompose).toMatch(/services:\s*\n\s+depsera:/);
    });

    it('maps port 3001', () => {
      expect(dockerCompose).toContain('3001:3001');
    });

    it('sets SESSION_SECRET environment variable', () => {
      expect(dockerCompose).toContain('SESSION_SECRET');
    });

    it('defaults to LOCAL_AUTH=true', () => {
      expect(dockerCompose).toContain('LOCAL_AUTH=true');
    });

    it('includes ADMIN_EMAIL and ADMIN_PASSWORD defaults', () => {
      expect(dockerCompose).toContain('ADMIN_EMAIL');
      expect(dockerCompose).toContain('ADMIN_PASSWORD');
    });

    it('includes commented OIDC configuration', () => {
      expect(dockerCompose).toContain('OIDC_ISSUER_URL');
      expect(dockerCompose).toContain('OIDC_CLIENT_ID');
      expect(dockerCompose).toContain('OIDC_CLIENT_SECRET');
      expect(dockerCompose).toContain('OIDC_REDIRECT_URI');
    });

    it('defines a named volume for data persistence', () => {
      expect(dockerCompose).toContain('depsera-data');
      // Verify volume is used in the service
      expect(dockerCompose).toMatch(/depsera-data:\/app\/server\/data/);
    });

    it('sets restart policy', () => {
      expect(dockerCompose).toContain('restart:');
    });

    it('sets image name to depsera', () => {
      expect(dockerCompose).toContain('image: depsera');
    });
  });

  describe('.dockerignore', () => {
    it('excludes node_modules', () => {
      expect(dockerignore).toContain('node_modules');
    });

    it('excludes .git directory', () => {
      expect(dockerignore).toContain('.git');
    });

    it('excludes data directories', () => {
      expect(dockerignore).toContain('data/');
    });

    it('excludes environment files', () => {
      expect(dockerignore).toContain('.env');
    });

    it('excludes test files', () => {
      expect(dockerignore).toContain('*.test.ts');
    });

    it('excludes the Dockerfile itself', () => {
      expect(dockerignore).toContain('Dockerfile');
    });
  });

  describe('required files exist', () => {
    it('Dockerfile exists at repo root', () => {
      expect(fs.existsSync(path.join(repoRoot, 'Dockerfile'))).toBe(true);
    });

    it('docker-compose.yml exists at repo root', () => {
      expect(fs.existsSync(path.join(repoRoot, 'docker-compose.yml'))).toBe(true);
    });

    it('.dockerignore exists at repo root', () => {
      expect(fs.existsSync(path.join(repoRoot, '.dockerignore'))).toBe(true);
    });
  });
});
