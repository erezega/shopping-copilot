import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs both apps on separate ports with an isolated DB and the scripted model (MOCK_LLM=1),
 * so it is deterministic and free. DummyJSON is real (network required).
 */
const SERVER_PORT = 3200;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      cwd: '../server',
      command: `rm -f e2e.db && npx prisma db push --url file:./e2e.db && npx nest build && node dist/main.js`,
      env: { MOCK_LLM: '1', PORT: String(SERVER_PORT), DATABASE_URL: 'file:./e2e.db' },
      url: `http://localhost:${SERVER_PORT}/api/conversations`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      env: { API_URL: `http://localhost:${SERVER_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
