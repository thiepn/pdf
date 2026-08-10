import { defineConfig } from "vitest/config";

declare const process: { env: Record<string, string | undefined> };

function resolveBase(): string {
  const explicitBase = process.env.VITE_BASE_PATH;
  if (explicitBase) {
    return explicitBase.endsWith("/") ? explicitBase : `${explicitBase}/`;
  }

  const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return process.env.GITHUB_ACTIONS === "true" && repository
    ? `/${repository}/`
    : "/";
}

function tesseractBrowserManifest() {
  return {
    name: "tesseract-browser-manifest",
    enforce: "pre" as const,
    load(id: string) {
      const normalizedId = id.replaceAll("\\", "/");
      if (!normalizedId.endsWith("/node_modules/tesseract.js/package.json")) return null;
      // Tesseract's browser modules only read these release fields. Supplying a
      // minimal JSON manifest prevents unrelated package scripts (including
      // dev-server URLs) from becoming production application data.
      return JSON.stringify({
        version: "7.0.0",
        dependencies: { "tesseract.js-core": "^7.0.0" }
      });
    }
  };
}

export default defineConfig({
  plugins: [tesseractBrowserManifest()],
  define: { "import.meta.env.VITE_BUILD_TIMESTAMP": JSON.stringify(process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString()) },
  base: resolveBase(),
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1400
  },
  worker: {
    format: "es"
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"]
    }
  }
});
