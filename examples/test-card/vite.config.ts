import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // The Tlachialoni renderer is a second Vite server rooted at this repository.
  // Give the example its own optimize cache so the two servers cannot replace
  // each other's dependency files and return 504 Outdated Optimize Dep.
  cacheDir: fileURLToPath(new URL("../../node_modules/.vite-test-card", import.meta.url)),
  plugins: [vue()],
  server: {
    port: 3000,
    strictPort: false,
  },
});
