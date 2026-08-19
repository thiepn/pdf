import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function relativeAsset(name) {
  return `./${name.replace(/^\.\//, "")}`;
}

function assetsReferencedByHtml(html) {
  const references = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) continue;
    const assetIndex = value.indexOf("assets/");
    if (assetIndex >= 0) references.add(relativeAsset(value.slice(assetIndex)));
  }
  return references;
}

function shouldPrecacheByDefault(asset, htmlReferences) {
  const normalized = asset.toLowerCase();
  const extension = extname(normalized);
  if (htmlReferences.has(asset)) return true;
  if ([".css", ".woff", ".woff2"].includes(extension)) return true;
  if (normalized.includes("pdf.worker")) return true;
  if (normalized.includes("/icons/") || normalized.includes("/color/")) return true;
  if (["./", "./index.html", "./manifest.webmanifest", "./sw.js", "./release-metadata.json"].includes(normalized)) return true;
  return false;
}

await stat(dist);
const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
const releaseChannel = process.env.VITE_RELEASE_CHANNEL === "stable" ? "stable" : "release-candidate";
const generatedAt = process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString();
const parsedEpoch = Date.parse(generatedAt);
const buildEpoch = Number.isFinite(parsedEpoch) ? parsedEpoch : 0;
const releaseMetadata = {
  schemaVersion: 1,
  version: packageJson.version,
  channel: releaseChannel,
  generatedAt,
  buildEpoch,
  sourceUrl: process.env.VITE_SOURCE_URL || ""
};
await writeFile(join(dist, "release-metadata.json"), JSON.stringify(releaseMetadata, null, 2));

const serviceWorkerPath = join(dist, "sw.js");
let serviceWorker = await readFile(serviceWorkerPath, "utf8");
serviceWorker = serviceWorker
  .replaceAll("__LPS_RELEASE_VERSION__", packageJson.version)
  .replaceAll("__LPS_RELEASE_CHANNEL__", releaseChannel)
  .replaceAll("__LPS_RELEASE_BUILD_EPOCH__", String(buildEpoch));
if (/__LPS_RELEASE_[A-Z_]+__/.test(serviceWorker)) throw new Error("Service-worker release identity placeholders were not fully stamped.");
await writeFile(serviceWorkerPath, serviceWorker);

const allAssets = (await walk(dist))
  .map((file) => relative(dist, file).replaceAll("\\", "/"))
  .filter((name) => !name.endsWith(".map") && !["offline-assets.json", "release-integrity.json"].includes(name))
  .map(relativeAsset)
  .sort();

const indexHtml = await readFile(join(dist, "index.html"), "utf8");
const htmlReferences = assetsReferencedByHtml(indexHtml);
const coreAssets = allAssets.filter((asset) => shouldPrecacheByDefault(asset, htmlReferences));
const optionalAssets = allAssets.filter((asset) => !coreAssets.includes(asset));

if (!coreAssets.some((asset) => /\/assets\/.*\.js$/i.test(asset))) {
  throw new Error("The generated consumer core does not contain the Vite entry JavaScript chunk.");
}
if (!optionalAssets.some((asset) => /\.js$/i.test(asset))) {
  throw new Error("No on-demand JavaScript chunks were detected. Route-level code splitting may have regressed.");
}

// `assets` remains the service-worker compatibility field. P0 intentionally
// points it at the fast consumer core only. Optional chunks are fetched and
// cached by the existing runtime cache on first use.
const manifest = {
  schemaVersion: 2,
  generatedAt,
  strategy: "consumer-core-plus-runtime-features",
  assets: coreAssets,
  coreAssets,
  optionalAssets
};
await writeFile(join(dist, "offline-assets.json"), JSON.stringify(manifest, null, 2));
console.log(`Offline asset manifest: ${coreAssets.length} core files, ${optionalAssets.length} on-demand files (${allAssets.length} total).`);
