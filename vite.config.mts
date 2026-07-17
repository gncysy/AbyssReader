import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname, "src/renderer"),
  base: "./",
  build: {
    target: "es2022",
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
        "undici",
        "node:vm",
        "node:fs",
        "node:path",
        "node:util",
        "node:events",
        "node:buffer",
        "node:fs/promises",
        "fs/promises",
      ],
      output: {
        manualChunks: {
          'naive-ui': ['naive-ui'],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src/renderer"),
      "@engine": path.join(__dirname, "src/engine"),
      "@shared": path.join(__dirname, "src/shared"),
      "node:vm": path.join(__dirname, "src/engine/utils/js-source.browser.js"),
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
      "cheerio",
      "crypto-js",
    ],
    exclude: [
      "buffer",
      "vm",
      "fs",
      "path",
      "electron",
      "undici",
      "node:vm",
      "node:fs",
      "node:path",
      "node:fs/promises",
      "fs/promises",
    ],
  },
});

