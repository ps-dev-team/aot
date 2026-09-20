import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/webapp',
  plugins: [react()],
  resolve: {
    // Mirror the tsconfig `@/*` alias so specs import app modules the same way
    // the app does.
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    name: 'webapp',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
  },
}));
