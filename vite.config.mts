import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, "src/renderer/index.html"),
      external: [
        "buffer",
        "vm",
        "fs",
        "path",
        "util",
        "events",
        "module",
        "async_hooks",
        "electron",
        "cheerio",
        "undici",
        "node:vm",
        "node:fs",
        "node:path",
        "node:util",
        "node:events",
        "node:buffer",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src/renderer"),
      "@engine": path.join(__dirname, "src/engine"),
      "@shared": path.join(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
  },
  define: {
    global: "globalThis",
    "process.env": "{}",
    "process.platform": JSON.stringify(process.platform),
    "process.version": JSON.stringify(process.version),
  },
  optimizeDeps: {
    include: [
      "naive-ui",
      "vue",
      "pinia",
      "vue-router",
      "@vicons/ionicons5",
      "isomorphic-dompurify",
      "dompurify",
      "dayjs",
      "file-saver",
      "jszip",
      "chinese-simple2traditional",
    ],
    exclude: [
      "buffer",
      "vm",
      "fs",
      "path",
      "electron",
      "cheerio",
      "undici",
    ],
  },
});
