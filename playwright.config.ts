import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  workers: 1,
  outputDir: '.artifacts/playwright',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8091',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    viewport: { width: 430, height: 932 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx apps/api/test/demo-server.ts',
      url: 'http://localhost:3901/api/v1/health',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run web --workspace @splitpool/mobile -- --port 8091 --host localhost',
      url: 'http://localhost:8091',
      timeout: 180000,
      reuseExistingServer: !process.env.CI,
      env: { CI: '1', BROWSER: 'none', EXPO_PUBLIC_API_URL: 'http://localhost:3901', EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' },
    },
  ],
});
