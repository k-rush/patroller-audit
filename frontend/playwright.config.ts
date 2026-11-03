import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:28080',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
