import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Local client/.env can set VITE_API_PROXY (e.g. http://localhost:3334).
  // Without it, use Docker host mapping: host 3333 → container PORT.
  const apiProxy = env.VITE_API_PROXY || "http://localhost:3333";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
