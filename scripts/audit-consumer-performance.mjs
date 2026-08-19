import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const manifestPath = resolve(dist, "offline-assets.json");
const appPath = resolve(root, "src/App.tsx");
const featureTierPath = resolve(root, "src/app/featureTiers.ts");

const coreJsBudgetKb = Number(process.env.LPS_CORE_JS_GZIP_BUDGET_KB || 800);
const coreTotalBudgetKb = Number(process.env.LPS_CORE_TOTAL_GZIP_BUDGET_KB || 1600);

function fail(message) {
  console.error(`Consumer performance audit FAILED: ${message}`);
  process.exitCode = 1;
}

function filePath(asset) {
  return resolve(dist, asset.replace(/^\.\//, ""));
}

async function compressedBytes(asset) {
  const bytes = await readFile(filePath(asset));
  return gzipSync(bytes, { level: 9 }).byteLength;
}

const [manifestText, appSource, featureTierSource] = await Promise.all([
  readFile(manifestPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(featureTierPath, "utf8")
]);
const manifest = JSON.parse(manifestText);
const coreAssets = Array.isArray(manifest.coreAssets) ? manifest.coreAssets : [];
const optionalAssets = Array.isArray(manifest.optionalAssets) ? manifest.optionalAssets : [];

if (manifest.schemaVersion !== 2) fail(`expected offline asset schema 2, found ${manifest.schemaVersion}`);
if (manifest.strategy !== "consumer-core-plus-runtime-features") fail("consumer core/runtime-cache strategy marker is missing");
if (!coreAssets.length) fail("consumer core asset set is empty");
if (!optionalAssets.length) fail("on-demand asset set is empty; route splitting likely regressed");

const coreSet = new Set(coreAssets);
for (const asset of optionalAssets) if (coreSet.has(asset)) fail(`asset appears in both core and optional sets: ${asset}`);

const eagerHeavyPatterns = [/tesseract/i, /ocr-language/i, /OcrPage/i, /ComparePage/i, /BatchPage/i, /DiagnosticsPage/i, /ValidationPage/i, /MaintenancePage/i];
for (const asset of coreAssets) {
  if (eagerHeavyPatterns.some((pattern) => pattern.test(asset))) fail(`specialist feature leaked into consumer precache: ${asset}`);
}

if (!appSource.includes("lazy(() => import(\"./workspace/UnifiedWorkspace\")")) fail("UnifiedWorkspace is no longer route-lazy");
if (!appSource.includes("lazy(() => import(\"./views/BatchPage\")")) fail("Batch route is no longer lazy");
if (!appSource.includes("lazy(() => import(\"./views/ComparePage\")")) fail("Compare route is no longer lazy");
if (!appSource.includes("lazy(() => import(\"./views/ScanPage\")")) fail("Scan route is no longer lazy");
if (!featureTierSource.includes("enterpriseSecurityInDefaultBundle: false")) fail("consumer/enterprise runtime boundary marker is missing");

const coreJs = coreAssets.filter((asset) => asset.endsWith(".js"));
if (!coreJs.length) fail("consumer core contains no JavaScript");

let coreJsGzip = 0;
let coreTotalGzip = 0;
for (const asset of coreAssets) {
  try {
    const bytes = await compressedBytes(asset);
    coreTotalGzip += bytes;
    if (asset.endsWith(".js")) coreJsGzip += bytes;
  } catch (reason) {
    fail(`cannot inspect ${asset}: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
}

const coreJsKb = coreJsGzip / 1024;
const coreTotalKb = coreTotalGzip / 1024;
if (coreJsKb > coreJsBudgetKb) fail(`core JavaScript is ${coreJsKb.toFixed(1)} KiB gzip; budget is ${coreJsBudgetKb} KiB`);
if (coreTotalKb > coreTotalBudgetKb) fail(`core precache is ${coreTotalKb.toFixed(1)} KiB gzip; budget is ${coreTotalBudgetKb} KiB`);

const optionalJs = [];
for (const asset of optionalAssets.filter((item) => item.endsWith(".js"))) {
  const info = await stat(filePath(asset));
  optionalJs.push({ asset, bytes: info.size });
}
optionalJs.sort((a, b) => b.bytes - a.bytes);

console.log("Consumer performance audit PASS");
console.log(`Core assets: ${coreAssets.length}`);
console.log(`On-demand assets: ${optionalAssets.length}`);
console.log(`Core JS gzip: ${coreJsKb.toFixed(1)} KiB / ${coreJsBudgetKb} KiB`);
console.log(`Core precache gzip: ${coreTotalKb.toFixed(1)} KiB / ${coreTotalBudgetKb} KiB`);
console.log("Largest on-demand JavaScript chunks:");
for (const item of optionalJs.slice(0, 8)) console.log(`  ${(item.bytes / 1024).toFixed(1)} KiB  ${item.asset}`);
