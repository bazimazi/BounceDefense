import { defineConfig } from 'vite';

// Set by `tauri android dev` / `tauri ios dev` so a device can reach the dev server.
const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Keep Tauri CLI output visible alongside Vite's.
  clearScreen: false,
  server: {
    port: 5173,
    // Tauri loads the fixed devUrl (http://localhost:5173), so only hold the port strictly under the Tauri CLI;
    // a plain `npm run dev` falls through to the next free port.
    strictPort: !!process.env.TAURI_ENV_PLATFORM,
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
    // The full-run simulation tests play several minutes of game time each; 5 s is too tight on a busy machine.
    testTimeout: 30000,
  },
} as any);
