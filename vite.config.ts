import { defineConfig } from 'vite';

// Set by `tauri android dev` / `tauri ios dev` so a device can reach the dev server.
const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Keep Tauri CLI output visible alongside Vite's.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Tauri debug builds keep source maps for the WebView inspector.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
