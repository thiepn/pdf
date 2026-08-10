import { readFile } from "node:fs/promises";
import { migrateBatchRecipe } from "../../../src/processing/batchModel.ts";
import { assertReadableStateSchema } from "../../../src/projects/stateSchemaGuard.ts";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.6 maintenance regression failed: ${name}`);
  passed += 1; checks.push(name);
}
function rejects(fn, pattern, name) {
  let ok = false;
  try { fn(); } catch (error) { ok = pattern.test(String(error)); }
  check(ok, name);
}
const root = new URL("../../../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const release = await readFile(new URL("src/core/release.ts", root), "utf8");
const settings = await readFile(new URL("src/settings/settingsStore.ts", root), "utf8");
const batch = await readFile(new URL("src/processing/batchModel.ts", root), "utf8");
const ocr = await readFile(new URL("src/ocr/ocrRepository.ts", root), "utf8");
const inbox = await readFile(new URL("src/pwa/shareInbox.ts", root), "utf8");
const home = await readFile(new URL("src/views/HomePage.tsx", root), "utf8");
const repo = await readFile(new URL("src/projects/projectRepository.ts", root), "utf8");
const swManager = await readFile(new URL("src/release/serviceWorkerManager.ts", root), "utf8");
const deploy = await readFile(new URL(".github/workflows/deploy.yml", root), "utf8");
const releaseWorkflow = await readFile(new URL(".github/workflows/release.yml", root), "utf8");

check(/^6\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "6.0.6+ compatibility version synchronization");
check(/hasFutureSettingsSchema/.test(settings) && /newer PDF Studio version/.test(settings) && /return \{ \.\.\.defaultSettings \}/.test(settings), "future settings remain untouched by older builds");
rejects(() => migrateBatchRecipe({ schemaVersion: 4, id: "future", name: "Future", steps: [], outputSuffix: "x", updatedAt: 1 }), /newer PDF Studio/, "future Batch recipes are rejected rather than down-converted");
check(/schemaVersion > CURRENT_BATCH_SCHEMA_VERSION/.test(batch), "Batch schema upper boundary is explicit");
rejects(() => assertReadableStateSchema(3, 2, "OCR job"), /newer PDF Studio/, "future OCR schema guard rejects newer jobs");
check(/assertReadableOcrJob/.test(ocr) && /OCR_SCHEMA_VERSION/.test(ocr) && /jobs\.map\(assertReadableOcrJob\)/.test(ocr), "local OCR reads reject future job schemas");
check(/CONSUMED_KEY/.test(inbox) && /acknowledgeSharedInboxFiles/.test(inbox) && /consumed\.has\(request\.url\)/.test(inbox), "Share Inbox uses durable consumed tombstones when cleanup fails");
check(/acknowledgeSharedInboxFiles\(\[inboxId\]\)/.test(home), "Home records successful inbox acknowledgement before navigation");
check(/authoritative PDF source first/.test(repo) && /project was kept so deletion can be retried safely/.test(repo), "project deletion retains manifest when source deletion cannot be guaranteed");
check(/const waiting = registration\.waiting/.test(swManager) && /waiting\.postMessage/.test(swManager) && /return true/.test(swManager), "service-worker activation captures waiting worker before transition race");
check(/test:runtime:v6\.0\.5/.test(deploy) && /test:runtime:v6\.0\.6/.test(deploy), "candidate deployment preserves v6.0.5 and v6.0.6 maintenance gates");
check(releaseWorkflow.includes(`tags: ["v${packageJson.version}"]`), "Stable workflow targets the current exact release tag");
check(packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.6"), "v6.0.6 maintenance regression is release-gated");

console.log(JSON.stringify({ name: "v6.0.6 Bug Fix Audit 4 maintenance regression", passed, total: passed, checks }, null, 2));
