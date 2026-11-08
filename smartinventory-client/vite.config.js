import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5239",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
     "/agent": {
   target: "http://127.0.0.1:8000",
  changeOrigin: true,
  ws: true,
  rewrite: (path) => path.replace(/^\/agent/, ""),
}, 

"/chat/import-preview": {
  target: "http://127.0.0.1:8000",
  changeOrigin: true,
},
"/chat": {
  target: "http://127.0.0.1:8000",
  changeOrigin: true,
  ws: true,
},
    },
  },
});