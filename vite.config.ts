import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

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

function nativeLunaCsp(mode: string) {
  const env = loadEnv(mode, ".", "VITE_");
  const sources = [
    env.VITE_PDF_CORE_URL,
    env.VITE_PDF_ACCOUNT_SUPABASE_URL
  ].filter((value): value is string => Boolean(value)).map((value) => {
    const UrlCtor = (globalThis as unknown as { URL: new (input: string) => {
      protocol: string; hostname: string; username: string; password: string;
      search: string; hash: string; pathname: string; origin: string;
    } }).URL;
    const url = new UrlCtor(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("F8 CSP requires exact configured Core and Account origins.");
    }
    return url.origin;
  });
  const origins = [...new Set(sources)];
  return {
    name: "f8-native-luna-csp",
    transformIndexHtml(html: string) {
      const base = "connect-src 'self' https://tessdata.projectnaptha.com;";
      if (!html.includes(base)) throw new Error("PDF Studio CSP source was not found.");
      let output = html.replace(base, `connect-src 'self' https://tessdata.projectnaptha.com${origins.map(x => " " + x).join("")};`);
      // The Account probe iframe transmits only signed-in/eligibility booleans.
      // It is permitted only when the full first-party OAuth client is configured.
      if (env.VITE_PDF_ACCOUNT_CLIENT_ID && env.VITE_PDF_ACCOUNT_REDIRECT_URI) {
        if (!output.includes("object-src 'none';")) throw new Error("Expected object-src CSP anchor");
        output = output.replace("object-src 'none';", "frame-src https://account.thiepn.dev; object-src 'none';");
      }
      return output;
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [tesseractBrowserManifest(), nativeLunaCsp(mode)],
  define: { "import.meta.env.VITE_BUILD_TIMESTAMP": JSON.stringify(process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString()) },
  base: resolveBase(),
  build: {
    target: "es2022",
    // Production source maps are opt-in. They are useful for a dedicated debug
    // build but should not increase the normal consumer release footprint.
    sourcemap: process.env.VITE_SOURCE_MAPS === "true",
    chunkSizeWarningLimit: 800,
    reportCompressedSize: true
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
}));
