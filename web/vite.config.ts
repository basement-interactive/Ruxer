import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri dev server config. The devUrl in tauri.conf.json points here.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy vendors into their own chunks so the entry bundle stays
        // small and parses fast. livekit-client (~the bulk of node_modules) is
        // only needed once the user joins voice, so isolating it keeps the
        // initial chat UI load lean; the chunk is still cached after first use.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("livekit")) return "livekit";
            if (id.includes("react") || id.includes("mobx")) return "vendor";
          }
        },
      },
    },
  },
});