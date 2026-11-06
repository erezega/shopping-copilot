/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_URL ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Browser talks only to Vite; /api is forwarded to Nest, so no CORS setup is needed.
    proxy: { '/api': apiTarget },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
