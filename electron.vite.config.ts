import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          shell: resolve(__dirname, "src/preload/shell.ts"),
          site: resolve(__dirname, "src/preload/site.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    plugins: [vue()],
  },
});
