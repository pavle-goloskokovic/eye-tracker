import { defineConfig } from 'vite';

export default defineConfig({
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
