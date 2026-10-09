import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
    fs: { allow: [".", "../shared"] },
  },
  preview: { port: 4173, host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { manualChunks: (id) => (id.includes("@babylonjs") ? "babylon" : undefined) } },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "jsdom",
  },
});
