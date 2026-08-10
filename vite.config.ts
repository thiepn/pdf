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

export default defineConfig({
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
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"]
    }
  }
});
