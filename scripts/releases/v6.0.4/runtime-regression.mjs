import { readFile } from "node:fs/promises";
import { assertReadableStateSchema } from "../../../src/projects/stateSchemaGuard.ts";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.4 maintenance regression failed: ${name}`);
  passed += 1; checks.push(name);
}
function rejects(fn, pattern, name) {
  let ok = false;
  try { fn(); } catch (error) { ok = pattern.test(String(error)); }
  check(ok, name);
}
const packageJson = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
const release = await readFile(new URL("../../../src/core/release.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../../../src/views/HomePage.tsx", import.meta.url), "utf8");
const repo = await readFile(new URL("../../../src/projects/projectRepository.ts", import.meta.url), "utf8");
const pkg = await readFile(new URL("../../../src/projects/projectPackage.ts", import.meta.url), "utf8");
const editorRepo = await readFile(new URL("../../../src/editor/editorRepository.ts", import.meta.url), "utf8");
const securityRepo = await readFile(new URL("../../../src/security/securityRepository.ts", import.meta.url), "utf8");
const nativeRepo = await readFile(new URL("../../../src/native/nativeRepository.ts", import.meta.url), "utf8");
const complianceRepo = await readFile(new URL("../../../src/compliance/complianceRepository.ts", import.meta.url), "utf8");
const releaseWorkflow = await readFile(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
const deployWorkflow = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");

check(/^[67]\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "historical v6 regression remains release-version synchronized on v6/v7");
check((/Import success is authoritative/.test(home) || /Persist logical acknowledgement/.test(home)) && /acknowledgeSharedInboxFiles\(\[inboxId\]\)/.test(home), "successful shared import is not converted into a failure by inbox cleanup");
check(/project\.schemaVersion <= PROJECT_SCHEMA_VERSION/.test(repo) && /compatibleExisting = migrateProjectManifestForSchema/.test(repo), "checksum deduplication skips future-schema manifests");
check(assertReadableStateSchema(1, 3, "test") === 1, "legacy state schema is readable");
check(assertReadableStateSchema(3, 3, "test") === 3, "current state schema is readable");
rejects(() => assertReadableStateSchema(4, 3, "Editor state"), /newer PDF Studio/, "future state schema is rejected");
rejects(() => assertReadableStateSchema(0, 3, "Editor state"), /invalid schema version/, "invalid state schema is rejected");
check(/assertReadableStateSchema/.test(editorRepo) && /schemaVersion < EDITOR_SCHEMA_VERSION/.test(editorRepo), "editor state refuses future-schema downgrade");
check(/assertReadableStateSchema/.test(securityRepo) && /schemaVersion < SECURITY_SCHEMA_VERSION/.test(securityRepo), "security state refuses future-schema downgrade");
check(/assertReadableStateSchema/.test(nativeRepo) && /NATIVE_EDITOR_SCHEMA_VERSION/.test(nativeRepo), "native editor state refuses future-schema downgrade");
check(/assertReadableStateSchema/.test(complianceRepo) && /COMPLIANCE_SCHEMA_VERSION/.test(complianceRepo), "compliance state refuses future-schema downgrade");
check(/validateEmbeddedStateSchemas/.test(pkg) && /OCR_SCHEMA_VERSION/.test(pkg), "project packages reject future embedded state schemas");
check(/Project editor object ID/.test(pkg) && /is duplicated/.test(pkg), "project packages reject duplicate editor object IDs");
check(/fetch-depth:\s*0/.test(releaseWorkflow) && /merge-base --is-ancestor/.test(releaseWorkflow), "Stable provenance uses full history for ancestry checks");
check(/test:runtime:v6\.0\.4/.test(deployWorkflow), "Pages deployment includes v6.0.4 regression gate");
check(packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.4"), "v6.0.4 maintenance regression is release-gated");
console.log(JSON.stringify({ name: "v6.0.4 maintenance regression", passed, total: passed, checks }, null, 2));
