import { defineConfig } from 'vite';

// Deploy base path. The GitHub Pages workflow sets BASE_PATH to
// "/<repo>/" so the site works under a sub-path; local dev and
// root deployments leave it unset.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: [
      // Route the bare "three" import (used by addons such as GLTFLoader)
      // to the WebGPU build so only one copy of Three.js is bundled.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
