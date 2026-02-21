import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yahoo/, ""),
      },
      // Python AI/ML backend (FastAPI server running on port 8000)
      "/pybackend": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pybackend/, ""),
      },
    },
  },
});

