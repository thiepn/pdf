import { access, readFile } from "node:fs/promises";

const VERSION = "7.0.0";
const checks = [];
function check(condition, name) {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P9 release-candidate audit failed: ${name}`);
}
const read = (path) => readFile(path, "utf8");
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

const [packageText, lockText, releaseSource, readme, changelog, deploy, stable, ci, nativeTypes, editor, fidelity, p8Test] = await Promise.all([
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("README.md"),
  read("CHANGELOG.md"),
  read(".github/workflows/deploy.yml"),
  read(".github/workflows/release.yml"),
  read(".github/workflows/ci.yml"),
  read("src/types/nativeEditor.ts"),
  read("src/views/EditorPage.tsx"),
  read("src/fidelity/pdfFidelityClient.ts"),
  read("tests/e2e/p8-fidelity-compatibility.spec.ts")
]);
const packageJson = JSON.parse(packageText);
const lock = JSON.parse(lockText);

check(packageJson.version === VERSION, "package version is frozen at v7.0.0");
check(lock.version === VERSION && lock.packages?.[""]?.version === VERSION, "package-lock release identity matches package.json");
check(releaseSource.includes(`APP_VERSION = "${VERSION}"`), "runtime APP_VERSION matches package metadata");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "P9 does not silently change persistent project/database formats");
check(packageJson.scripts?.["release:web"]?.includes("audit:p9:release-candidate") && packageJson.scripts?.["release:web"]?.includes("test:runtime:v7.0.0"), "release:web contains the P9 freeze and v7 runtime gates");
check(packageJson.scripts?.["test:v7.0.0"] === "npm run release:web && npm run test:runtime:v7.0.0", "v7 qualification command is deterministic");

check(readme.includes("v7.0.0 is the Universal Editing release candidate") && readme.includes("Qualified `v7.0.0` tag only"), "README exposes the v7 RC/stable boundary");
check(readme.includes("does not claim universal Word-like PDF text reflow"), "README retains explicit non-universal editing boundary");
check(changelog.includes("## 7.0.0 — Universal Editing Release Candidate"), "changelog contains the frozen v7 capability summary");

check(stable.includes('tags: ["v7.0.0"]') && stable.includes('test "$GITHUB_REF_NAME" = "v7.0.0"'), "Stable publication is bound to the exact v7 tag");
check(stable.includes("VITE_RELEASE_CHANNEL: stable") && stable.includes("main history"), "Stable channel and ancestry provenance remain fail-closed");
check(stable.includes("npm run audit:p9:release-candidate") && stable.includes("npm run release:web"), "Stable publication reruns P9 and the full frozen web gate");
check(stable.includes("Rebuild and prove reproducibility") && stable.includes("Browser-qualify exact stable artifact") && stable.includes("High-severity dependency security gate"), "Stable publication retains reproducibility/browser/security qualification");
check(stable.includes('"version": "7.0.0"') && stable.includes('"channel": "stable"'), "Stable artifact metadata is explicitly verified");
check(stable.includes("smoke-stable") && stable.includes("action-gh-release"), "GitHub Release publication stays downstream of deployed smoke validation");

check(deploy.includes("VITE_RELEASE_CHANNEL: release-candidate") && deploy.includes("npm run audit:p9:release-candidate") && deploy.includes("npm run test:runtime:v7.0.0"), "candidate deployment is P9-gated and cannot masquerade as Stable");
check(deploy.includes("Reproducible deployment build") && deploy.includes("Browser-qualify exact distribution before deployment"), "candidate Pages deployment retains exact-artifact reproducibility/browser qualification");
check(deploy.includes("grep -F '7.0.0'") && deploy.includes('"channel": "release-candidate"'), "deployed candidate smoke test verifies v7 identity/channel");
check(ci.includes("P9 release-candidate freeze audit") && ci.includes("Generate and validate P8 compatibility corpus") && ci.includes("Browser regression and privacy checks against verified dist"), "PR CI chains P8 compatibility, P9 freeze, and exact-dist browser regression");

for (const path of [
  "src/workers/native-editor.worker.ts",
  "src/workers/native-image.worker.ts",
  "src/workers/native-vector.worker.ts",
  "src/workers/native-table.worker.ts",
  "src/workers/native-complex.worker.ts",
  "src/editor/unifiedLayout.ts",
  "src/fidelity/pdfFidelity.ts",
  "src/fidelity/pdfFidelityClient.ts",
  "tests/e2e/p1-existing-content.spec.ts",
  "tests/e2e/p2-layout-reflow.spec.ts",
  "tests/e2e/p3-existing-image.spec.ts",
  "tests/e2e/p4-existing-vector.spec.ts",
  "tests/e2e/p5-existing-table.spec.ts",
  "tests/e2e/p6-unified-layout.spec.ts",
  "tests/e2e/p7-complex-nested.spec.ts",
  "tests/e2e/p8-fidelity-compatibility.spec.ts"
]) check(await exists(path), `release-critical P1–P8 artifact exists: ${path}`);

check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes), "native editor schema remains the P7/P8-qualified schema v6");
check(editor.includes("validatePdfFidelity") || fidelity.includes("validatePdfFidelity"), "unified export remains fidelity-certified");
check(fidelity.includes("unaffectedSampleSet") && fidelity.includes("semanticFingerprint"), "P8 semantic deep-scan remains bounded to untouched sampled pages");
check(/rotated and cropped/i.test(p8Test) && /incremental revision/i.test(p8Test), "P8 compatibility editor/export cases remain browser-gated");

const passed = checks.filter((item) => item.passed).length;
console.log(JSON.stringify({ phase: "P9", release: `v${VERSION}`, status: "RC_FREEZE_PASS", passed, total: checks.length, checks }, null, 2));
