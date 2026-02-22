/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/types/**/*.d.ts',
    // Entry points and CLI tools (not unit-testable)
    '!src/index.ts',
    '!src/db/cli.ts',
    '!src/db/seed.ts',
    // Re-export barrel files (no logic to test)
    '!src/auth/index.ts',
    '!src/services/index.ts',
    '!src/stores/impl/index.ts',
    '!src/utils/index.ts',
    '!src/routes/formatters/index.ts',
    '!src/services/matching/index.ts',
    '!src/services/polling/index.ts',
    '!src/services/graph/index.ts',
    // Session middleware config (no logic, just configuration)
    '!src/auth/session.ts',
    // Database infrastructure (covered by integration tests)
    '!src/db/index.ts',
    '!src/db/migrate.ts',
    '!src/db/migrations/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 90,
      functions: 90,
      lines: 99
    }
  }
};
