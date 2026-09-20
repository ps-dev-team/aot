import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { api } from './server/api.ts';

export default defineConfig({
  plugins: [preact(), api()],
  server: { port: 5173, strictPort: true },
});
