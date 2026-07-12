import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_BASE?.trim() || "http://127.0.0.1:3000";
  const helpProxyTarget = env.VITE_HELP_DEV?.trim() || "http://localhost:3456";

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-mui": ["@mui/material", "@mui/icons-material"],
            "vendor-pdf": ["pdfjs-dist", "pdf-lib"],
            "vendor-office": ["xlsx", "docx-preview"],
            "vendor-heic": ["heic2any"],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Docusaurus user guide (backend/3khelp) at /document/ — run `npm start` in 3khelp (port 3456).
        "/document": {
          target: helpProxyTarget,
          changeOrigin: true,
          ws: true,
        },
        // Same-origin `/api/*` in dev (e.g. http://localhost:5173/api/docs → Nest Swagger).
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        // Socket.IO transport for the /notifications namespace (live bell updates).
        "/socket.io": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
