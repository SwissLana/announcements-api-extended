import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['./tests/database.setup.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: {
      ALLOWED_ORIGINS: 'http://localhost:5173',
      JWT_SECRET: 'test-only-secret-not-for-production-123456789',
    },
  },
});
