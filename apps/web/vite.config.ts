import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverOrigin = env.VITE_SERVER_ORIGIN || 'http://localhost:8787';
  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Resolve the workspace package to its TypeScript source so Vite
        // transpiles it (the package's main is a .ts entry).
        '@throughline/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      },
    },
    server: {
      // Allow importing tokens.css and shared sources from the repo root.
      fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
      proxy: {
        '/api': { target: serverOrigin, changeOrigin: true },
      },
    },
  };
});
