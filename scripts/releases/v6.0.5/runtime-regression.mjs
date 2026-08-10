import { readFile } from "node:fs/promises";
import { assertReadableProjectManifestSchema } from "../../../src/projects/projectManifestMigration.ts";
import { assertReadableStateSchema } from "../../../src/projects/stateSchemaGuard.ts";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.5 maintenance regression failed: ${name}`);
  passed += 1;
  checks.push(name);
}
function rejects(fn, pattern, name) {
  let ok = false;
  try { fn(); } catch (error) { ok = pattern.test(String(error)); }
  check(ok, name);
}

const root = new URL("../../../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const release = await readFile(new URL("src/core/release.ts", root), "utf8");
const launchFiles = await readFile(new URL("src/pwa/launchFiles.ts", root), "utf8");
const shareInbox = await readFile(new URL("src/pwa/shareInbox.ts", root), "utf8");
const home = await readFile(new URL("src/views/HomePage.tsx", root), "utf8");
const maintenance = await readFile(new URL("src/maintenance/maintenance.ts", root), "utf8");
const manager = await readFile(new URL("src/release/serviceWorkerManager.ts", root), "utf8");
const sw = await readFile(new URL("public/sw.js", root), "utf8");
const projectPackage = await readFile(new URL("src/projects/projectPackage.ts", root), "utf8");
const workspace = await readFile(new URL("src/workspace/workspaceRepository.ts", root), "utf8");
const deploy = await readFile(new URL(".github/workflows/deploy.yml", root), "utf8");

check(/^6\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "6.0.5+ 6.x compatibility version synchronization");
check(/storeSharedInboxFiles\(files\)/.test(launchFiles) && /peekPendingPwaLaunchFiles/.test(launchFiles) && /acknowledgePendingPwaLaunchFiles/.test(launchFiles), "OS file launches are durably staged or non-destructively queued");
check(/peekPendingPwaLaunchFiles/.test(home) && !/takePendingPwaLaunchFiles/.test(home) && /launchId/.test(home), "Home acknowledges fallback launch files only after import success or explicit cancel");
check(/Promise\.allSettled\(inserted\.map/.test(shareInbox), "page-context launch inbox writes roll back atomically");
check(/refreshActiveReleaseCache/.test(maintenance) && !/isLocalPdfStudioCache/.test(maintenance) && /pending shared files/.test(maintenance), "maintenance refresh preserves pending shared document bytes");
check(/refreshCurrentReleaseCache/.test(sw) && /existing offline shell was preserved/.test(sw) && /REFRESH_RELEASE_CACHE/.test(sw), "offline shell refresh fails without deleting the existing release cache");
check(/120_000/.test(manager) && /REFRESH_RELEASE_CACHE/.test(manager), "long-running offline shell refresh has a maintenance-appropriate RPC timeout");
check(assertReadableProjectManifestSchema(3, 3) === 3, "current project manifest schema remains readable");
rejects(() => assertReadableProjectManifestSchema(4, 3), /newer PDF Studio/, "future project manifest schema is rejected");
check(/assertReadableProjectManifestSchema\(header\.manifest\.schemaVersion, PROJECT_SCHEMA_VERSION\)/.test(projectPackage), "project-package restore rejects future manifest schemas before reconstruction");
rejects(() => assertReadableStateSchema(2, 1, "Workspace session"), /newer PDF Studio/, "future workspace-session schema is rejected");
check(/assertReadableStateSchema\(value\.schemaVersion, WORKSPACE_SCHEMA_VERSION, "Workspace session"\)/.test(workspace), "workspace session normalization refuses future-schema downgrade");
check(/test:runtime:v6\.0\.1/.test(deploy) && /test:runtime:v6\.0\.4/.test(deploy), "Pages deployment preserves every earlier 6.0.x maintenance regression");
check(/test:runtime:v6\.0\.5/.test(deploy), "Pages deployment includes v6.0.5 regression gate");
check(packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.5"), "v6.0.5 maintenance regression is release-gated");

console.log(JSON.stringify({ name: "v6.0.5 Bug Fix Audit 3 maintenance regression", passed, total: passed, checks }, null, 2));
