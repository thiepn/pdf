import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const MAX_JS_FILE = 12 * 1024 * 1024;
const MAX_JS_TOTAL = 28 * 1024 * 1024;
const MAX_DIST_TOTAL = 120 * 1024 * 1024;
const FORBIDDEN_RUNTIME_APIS = [
  { name: "Map/WeakMap getOrInsert", pattern: /\.getOrInsert\s*\(/ },
  { name: "Map/WeakMap getOrInsertComputed", pattern: /\.getOrInsertComputed\s*\(/ }
];
const failures = [];
let offlineManifest = null;

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}

for (const required of ["index.html", "sw.js", "manifest.webmanifest", "offline-assets.json", "release-metadata.json", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"]) {
  try { await stat(join(dist, required)); } catch { failures.push(`Missing required build file: ${required}`); }
}

try { await stat(join(dist, "tesseract/core/tesseract-core-simd-lstm.wasm.js")); }
catch { failures.push("Missing stable Tesseract SIMD LSTM core."); }
try { await stat(join(dist, "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js")); failures.push("Broken Tesseract relaxed-SIMD LSTM core must not be shipped."); }
catch { /* intentionally excluded */ }

const offlineManifestPath = join(dist, "offline-assets.json");
try {
  offlineManifest = JSON.parse(await readFile(offlineManifestPath, "utf8"));
  if (offlineManifest.schemaVersion !== 2) failures.push(`offline-assets.json schema ${String(offlineManifest.schemaVersion)} is unsupported; expected schema 2.`);
  if (offlineManifest.strategy !== "consumer-core-plus-runtime-features") failures.push("offline-assets.json is missing the P0 consumer core/runtime-feature strategy marker.");
  if (!Array.isArray(offlineManifest.assets) || !offlineManifest.assets.length) failures.push("offline-assets.json does not contain a non-empty service-worker asset list.");
  if (!Array.isArray(offlineManifest.coreAssets) || !offlineManifest.coreAssets.length) failures.push("offline-assets.json does not contain a non-empty consumer core asset list.");
  if (!Array.isArray(offlineManifest.optionalAssets) || !offlineManifest.optionalAssets.length) failures.push("offline-assets.json does not contain on-demand assets; route splitting may have regressed.");

  const validateEntries = async (entries, label) => {
    const missing = [];
    const seen = new Set();
    for (const entry of entries || []) {
      if (typeof entry !== "string" || !entry.startsWith("./") || entry.endsWith(".map")) {
        failures.push(`Invalid ${label} asset entry: ${String(entry)}`);
        continue;
      }
      if (seen.has(entry)) failures.push(`Duplicate ${label} asset entry: ${entry}`);
      seen.add(entry);
      try { await stat(join(dist, entry.slice(2))); } catch { missing.push(entry); }
    }
    if (missing.length) failures.push(`${label} asset list references missing files: ${missing.slice(0, 8).join(", ")}`);
    return seen;
  };

  const serviceWorkerAssets = await validateEntries(offlineManifest.assets, "service-worker");
  const coreAssets = await validateEntries(offlineManifest.coreAssets, "core");
  const optionalAssets = await validateEntries(offlineManifest.optionalAssets, "on-demand");

  if (serviceWorkerAssets.size !== coreAssets.size || [...serviceWorkerAssets].some((entry) => !coreAssets.has(entry))) {
    failures.push("Service-worker install assets must exactly match consumer coreAssets in the P0 split-cache model.");
  }
  for (const entry of coreAssets) {
    if (optionalAssets.has(entry)) failures.push(`Asset appears in both core and on-demand lists: ${entry}`);
  }
} catch (reason) {
  failures.push(`Could not validate offline-assets.json: ${reason instanceof Error ? reason.message : String(reason)}`);
}

try {
  const metadata = JSON.parse(await readFile(join(dist, "release-metadata.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const expectedChannel = process.env.VITE_RELEASE_CHANNEL === "stable" ? "stable" : "release-candidate";
  const expectedTimestamp = process.env.VITE_BUILD_TIMESTAMP || metadata.generatedAt;
  const expectedEpoch = Date.parse(expectedTimestamp);
  if (metadata.schemaVersion !== 1) failures.push("release-metadata.json has an unsupported schema.");
  if (metadata.version !== packageJson.version) failures.push(`Release metadata version ${metadata.version} does not match package version ${packageJson.version}.`);
  if (metadata.channel !== expectedChannel) failures.push(`Release metadata channel ${metadata.channel} does not match expected ${expectedChannel}.`);
  if (!Number.isFinite(metadata.buildEpoch) || metadata.buildEpoch < 0) failures.push("Release metadata buildEpoch is invalid.");
  if (Number.isFinite(expectedEpoch) && metadata.buildEpoch !== expectedEpoch) failures.push(`Release metadata buildEpoch ${metadata.buildEpoch} does not match build timestamp ${expectedTimestamp}.`);
  const sw = await readFile(join(dist, "sw.js"), "utf8");
  if (/__LPS_RELEASE_[A-Z_]+__/.test(sw)) failures.push("Built service worker still contains unstamped release identity placeholders.");
  if (!sw.includes(`const RELEASE_VERSION = "${packageJson.version}";`)) failures.push("Built service worker version does not match package version.");
  if (!sw.includes(`const RELEASE_CHANNEL = "${expectedChannel}";`)) failures.push("Built service worker channel does not match the release channel.");
  if (!sw.includes(`const RELEASE_BUILD_EPOCH = Number("${metadata.buildEpoch}")`)) failures.push("Built service worker build identity does not match release metadata.");
} catch (reason) { failures.push(`Could not validate release-metadata.json/service-worker identity: ${reason instanceof Error ? reason.message : String(reason)}`); }

const files = await walk(dist);
let total = 0;
let jsTotal = 0;
const integrity = [];
for (const file of files) {
  if (file.endsWith("release-integrity.json")) continue;
  const bytes = await readFile(file);
  const size = bytes.byteLength;
  const name = relative(dist, file).replaceAll("\\", "/");
  total += size;
  if ([".js", ".mjs"].includes(extname(file))) {
    jsTotal += size;
    if (size > MAX_JS_FILE) failures.push(`${name} exceeds the ${MAX_JS_FILE} byte JavaScript file budget.`);
    const text = bytes.toString("utf8");
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)/.test(text)) failures.push(`${name} contains a development origin.`);
    for (const api of FORBIDDEN_RUNTIME_APIS) {
      if (api.pattern.test(text)) failures.push(`${name} contains unsupported runtime API: ${api.name}.`);
    }
  }
  integrity.push({ path: name, bytes: size, sha256: createHash("sha256").update(bytes).digest("hex") });
}
if (jsTotal > MAX_JS_TOTAL) failures.push(`JavaScript total ${jsTotal} exceeds budget ${MAX_JS_TOTAL}.`);
if (total > MAX_DIST_TOTAL) failures.push(`Distribution total ${total} exceeds budget ${MAX_DIST_TOTAL}.`);

if (offlineManifest && Array.isArray(offlineManifest.coreAssets) && Array.isArray(offlineManifest.optionalAssets)) {
  const accounted = new Set([...offlineManifest.coreAssets, ...offlineManifest.optionalAssets]);
  const expected = new Set(
    files
      .map((file) => relative(dist, file).replaceAll("\\", "/"))
      .filter((name) => !name.endsWith(".map") && !["offline-assets.json", "release-integrity.json"].includes(name))
      .map((name) => `./${name}`)
  );
  const missingFromManifest = [...expected].filter((entry) => !accounted.has(entry));
  const unexpectedInManifest = [...accounted].filter((entry) => !expected.has(entry));
  if (missingFromManifest.length) failures.push(`Production files missing from core/on-demand manifest accounting: ${missingFromManifest.slice(0, 8).join(", ")}`);
  if (unexpectedInManifest.length) failures.push(`Manifest accounts for unexpected production files: ${unexpectedInManifest.slice(0, 8).join(", ")}`);
}

const index = await readFile(join(dist, "index.html"), "utf8");
if (!index.includes("Content-Security-Policy")) failures.push("Built index.html is missing Content Security Policy.");
if (!index.includes("manifest.webmanifest")) failures.push("Built index.html is missing the web manifest link.");

const expectedBase = (() => {
  const raw = process.env.VITE_BASE_PATH || process.env.BASE_URL || "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
})();
const urlAttributes = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
for (const value of urlAttributes) {
  if (/^(?:https?:|data:|blob:|#)/.test(value)) continue;
  if (value.startsWith("/") && expectedBase !== "/" && !value.startsWith(expectedBase)) failures.push(`Built index URL ${value} escapes expected base ${expectedBase}.`);
}
if (index.includes('/src/main.tsx')) failures.push("Built index.html still references the source entry instead of a bundled asset.");

const report = { schemaVersion: 1, generatedAt: process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString(), totalBytes: total, javascriptBytes: jsTotal, fileCount: integrity.length, files: integrity };
await writeFile(join(dist, "release-integrity.json"), JSON.stringify(report, null, 2));
console.log(`Distribution audit: ${integrity.length} files, ${(total / 1024 / 1024).toFixed(2)} MiB total, ${(jsTotal / 1024 / 1024).toFixed(2)} MiB JavaScript.`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
