import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Inline next-auth: its env.js imports 'next/server', which vitest cannot
    // resolve unless transformed — otherwise every auth-touching test dies at
    // import. No-op for apps without auth. (agent-showcase 2026-07-02.)
    server: { deps: { inline: [/next-auth/, /@auth/] } },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
