import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(__dirname, '../../packages/shared/src');

export default defineConfig({
  resolve: {
    // Alias the shared workspace to its TypeScript source so we don't have to
    // pre-build packages/shared before running `vite dev`.
    alias: [
      { find: /^@vcc\/shared\/schemas$/, replacement: `${sharedSrc}/schemas/index.ts` },
      { find: /^@vcc\/shared\/confidence$/, replacement: `${sharedSrc}/confidence.ts` },
      { find: /^@vcc\/shared\/devices$/, replacement: `${sharedSrc}/devices.ts` },
      { find: /^@vcc\/shared$/, replacement: `${sharedSrc}/index.ts` },
    ],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vitals Command Center',
        short_name: 'Vitals',
        description: 'A calm, private health command center — unify your wearables, daily readiness, and an AI brief.',
        theme_color: '#F6F8FA',
        background_color: '#F6F8FA',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // bind 0.0.0.0 so the tailnet (not just localhost) can reach it
    port: 5173,
    allowedHosts: ['.ts.net'], // allow MagicDNS hosts (e.g. your-host.your-tailnet.ts.net)
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
