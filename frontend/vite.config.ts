import { defineConfig } from "vitest/config";

// The API target is configurable so end-to-end tests can use an isolated backend.
const api = process.env.OI_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  server: {
    port: Number(process.env.OI_WEB_PORT ?? 5173),
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": { target: api, changeOrigin: false } },
    fs: { allow: [".", "../shared"] },
  },
  preview: { port: 4173, host: "127.0.0.1", proxy: { "/api": api } },
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
