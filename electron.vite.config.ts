import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";

/**
 * Resolves the release date baked into the main bundle for the About panel
 * (specs/006-release-versioning-about/contracts/release-identity.md).
 *
 * The authoritative source is the tag `v<package.version>`: its creation date is
 * the day that version shipped. Before a version is tagged (dev builds) we fall
 * back to the build day, so the panel always renders and the build never fails
 * when git or the tag is unavailable.
 */
function resolveReleaseDate(): string {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as {
    version?: string;
  };
  const tag = `v${pkg.version ?? ""}`;
  try {
    const out = execFileSync(
      "git",
      ["for-each-ref", "--format=%(creatordate:short)", `refs/tags/${tag}`],
      { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // Not a git checkout, or git is unavailable: use the build day below.
  }
  return new Date().toISOString().slice(0, 10);
}

export default defineConfig({
  main: {
    define: {
      __APP_RELEASE_DATE__: JSON.stringify(resolveReleaseDate()),
    },
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
