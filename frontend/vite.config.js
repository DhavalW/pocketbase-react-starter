import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    // Output directly into pb_public/ so PocketBase serves the built app
    outDir: "../pb_public",
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy /api/* to PocketBase so you never hit CORS during development
      "/api": {
        target: process.env.VITE_PB_URL || "http://127.0.0.1:8090",
        changeOrigin: true,
      },
    },
  },
});
