import { access, readFile } from "node:fs/promises";

const freeze = JSON.parse(await readFile("docs/p9/release-freeze.json", "utf8"));
const VERSION = freeze.version;
if (!/^7\.\d+\.\d+$/.test(VERSION) || freeze.stableTag !== `v${VERSION}` || freeze.channel !== "release-candidate") throw new Error("Invalid v7 candidate freeze identity.");
const checks = [];
function check(condition, name) {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P9 release-candidate audit failed: ${name}`);
}
const read = (path) => readFile(path, "utf8");
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

const [packageText, lockText, releaseSource, readme, changelog, deploy, stable, completion, ci, nativeTypes, editor, secure, fidelity, p8Test, releaseNotes] = await Promise.all([
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("README.md"),
  read("CHANGELOG.md"),
  read(".github/workflows/deploy.yml"),
  read(".github/workflows/release.yml"),
  read(".github/workflows/release-completion.yml"),
  read(".github/workflows/ci.yml"),
  read("src/types/nativeEditor.ts"),
  read("src/views/EditorPage.tsx"),
  read("src/views/SecurePage.tsx"),
  read("src/fidelity/pdfFidelityClient.ts"),
  read("tests/e2e/p8-fidelity-compatibility.spec.ts"),
  read(freeze.releaseNotes)
]);
const packageJson = JSON.parse(packageText);
const lock = JSON.parse(lockText);

check(freeze.schemaVersion === 2 && freeze.roadmap === "task-first-product-hardening", "P9 freeze manifest uses the current task-first roadmap schema");
check(freeze.certification === "pending-ci", "source freeze never self-declares certification before CI");
check(freeze.certificateArtifact === `v${VERSION}-release-certificate`, "release certificate artifact is bound to the frozen version");
check(packageJson.version === VERSION, `package version is frozen at v${VERSION}`);
check(lock.version === VERSION && lock.packages?.[""]?.version === VERSION, "package-lock release identity matches package.json");
check(releaseSource.includes(`APP_VERSION = "${VERSION}"`), "runtime APP_VERSION matches package metadata");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "P9 does not silently change persistent project/database formats");
check(packageJson.scripts?.["release:web"]?.includes("audit:p9:release-candidate") && packageJson.scripts?.["release:web"]?.includes("test:runtime:v7.0.0"), "release:web contains the P9 freeze and v7 runtime gates");
check(packageJson.scripts?.["test:v7.0.0"] === "npm run release:web && npm run test:runtime:v7.0.0", "v7 qualification command is deterministic");

check(readme.includes(`v${VERSION} is the task-first release candidate`) && readme.includes(`Qualified \`v${VERSION}\` tag only`), "README exposes the v7 RC/stable boundary");
check(readme.includes("does not claim universal Word-like PDF text reflow"), "README retains explicit non-universal editing boundary");
check(changelog.includes(`## ${VERSION} — Task-first PDF Tools & Release Candidate`), "changelog contains the frozen v7 capability summary");
check(releaseNotes.includes(`# PDF Studio v${VERSION}`) && releaseNotes.includes("Fidelity and compatibility") && releaseNotes.includes("Native file workflow"), "curated release notes describe the current product-hardening stack");

const expectedPhaseDocs = {
  P1: "docs/product/P1_EXISTING_TEXT_EDITING_EXCELLENCE.md",
  P2: "docs/product/P2_INTELLIGENT_DOCUMENT_ENTRY.md",
  P3: "docs/product/P3_OCR_SCAN_TO_EDITABLE.md",
  P4: "docs/product/P4_NATIVE_FILE_WORKFLOW.md",
  P5: "docs/product/P5_TRUST_OUTPUT_VERIFICATION.md",
  P6: "docs/product/P6_MOBILE_INTERACTION_EXCELLENCE.md",
  P7: "docs/product/P7_FORMS_REDACTION_EXCELLENCE.md",
  P8: "docs/product/P8_FIDELITY_COMPATIBILITY.md"
};
for (const [phase, path] of Object.entries(expectedPhaseDocs)) {
  check(freeze.phaseDocs?.[phase] === path, `${phase} freeze manifest points to the current product contract`);
  check(await exists(path), `${phase} current product contract exists: ${path}`);
  const text = await read(path);
  check(text.startsWith(`# ${phase} —`), `${phase} product contract has the expected phase identity`);
}

check(stable.includes(`tags: ["v${VERSION}"]`) && stable.includes(`test "$GITHUB_REF_NAME" = "v${VERSION}"`), "Stable publication is bound to the exact v7 tag");
check(stable.includes("VITE_RELEASE_CHANNEL: stable") && stable.includes("main history"), "Stable channel and ancestry provenance remain fail-closed");
check(stable.includes("npm run audit:p9:release-candidate") && stable.includes("npm run release:web"), "Stable publication reruns P9 and the full frozen web gate");
check(stable.includes("Rebuild and prove reproducibility") && stable.includes("Browser-qualify exact stable artifact") && stable.includes("High-severity dependency security gate"), "Stable publication retains reproducibility/browser/security qualification");
check(stable.includes(`"version": "${VERSION}"`) && stable.includes('"channel": "stable"'), "Stable artifact metadata is explicitly verified");
check(stable.includes("smoke-stable") && stable.includes("action-gh-release"), "GitHub Release publication stays downstream of deployed smoke validation");
check(stable.includes("body_path: release-assets/pdf-studio-v7.1.4-release-notes.md"), "Stable GitHub Release uses curated frozen release notes");
check(stable.includes("release-freeze.json") && stable.includes("release-metadata.json") && stable.includes("release-integrity.json") && stable.includes("license-inventory.json"), "Stable release assets include freeze, build identity, integrity and licence evidence");
check(completion.includes(`name: v${VERSION}-release-certificate`) && completion.includes("Certify every browser and channel from actual reports"), "Release completion emits the exact-version browser certificate");
check(completion.includes("pull_request:") && completion.includes("docs/p9/release-freeze.json"), "P9 freeze changes automatically trigger Release completion verification");
check(completion.includes("github.event.pull_request.head.sha || github.sha") && completion.includes('RELEASE_SOURCE_SHA'), "Release completion binds preparation/browser/certificate evidence to the exact PR head");
check(completion.includes("channel: [release-candidate, stable]") && completion.includes("retries=0"), "Release completion qualifies both channels without retry-based flake masking");

check(deploy.includes("VITE_RELEASE_CHANNEL: release-candidate") && deploy.includes("npm run audit:p9:release-candidate") && deploy.includes("npm run test:runtime:v7.0.0"), "candidate deployment is P9-gated and cannot masquerade as Stable");
check(deploy.includes("Reproducible deployment build") && deploy.includes("Browser-qualify exact distribution before deployment"), "candidate Pages deployment retains exact-artifact reproducibility/browser qualification");
const dynamicCandidateSmoke = deploy.includes("EXPECTED_VERSION: ${{ needs.deployment-policy.outputs.version }}") && deploy.includes('grep -F "${EXPECTED_VERSION}"');
const frozenCandidateSmoke = deploy.includes(`grep -F '${VERSION}'`);
check((dynamicCandidateSmoke || frozenCandidateSmoke) && deploy.includes('"channel": "release-candidate"'), "deployed candidate smoke test verifies v7 identity/channel");
check(ci.includes("P9 release-candidate freeze audit") && ci.includes("Generate and validate P8 compatibility corpus") && ci.includes("Browser regression and privacy checks against verified dist"), "PR CI chains P8 compatibility, P9 freeze, and exact-dist browser regression");

for (const path of [
  "src/editor/native/nativeFindReplace.ts",
  "src/product/DocumentEntryRecommendations.tsx",
  "src/ocr/ocrLayerPdf.ts",
  "src/files/nativeFileWorkflow.ts",
  "src/trust/outputVerification.ts",
  "src/mobile/MobileViewportManager.tsx",
  "src/security/formAuthoring.ts",
  "src/security/redactionDiscovery.ts",
  "src/fidelity/pdfFidelity.ts",
  "src/fidelity/pdfFidelityClient.ts"
]) check(await exists(path), `current task-first P1–P8 release artifact exists: ${path}`);

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
check(editor.includes("validatePdfFidelity") && secure.includes("validatePdfFidelity"), "Editor and Secure publication paths remain fidelity-certified");
check(editor.includes("verifyOutputTrust"), "Editor retains P5 output-verification evidence");
check(secure.includes("FormAuthoringPanel") && secure.includes("RedactionDiscoveryPanel"), "P7 reviewed forms/redaction remain on the canonical Secure path");
check(fidelity.includes("PdfFidelityValidationOptions") && fidelity.includes("comparePdfFidelityProfiles"), "P8 intent-aware fidelity client remains active");
check(fidelity.includes("const affectedSet = new Set(affected)") && fidelity.includes("semanticFingerprint(page, pageNumber, !affectedSet.has(pageNumber))") && fidelity.includes("if (!deep)"), "P8 semantic deep-scan remains bounded to untouched sampled pages");
check(/rotated crop geometry/i.test(p8Test) && /incremental revisions/i.test(p8Test), "P8 compatibility editor/export cases remain browser-gated");

const passed = checks.filter((item) => item.passed).length;
console.log(JSON.stringify({ phase: "P9", release: `v${VERSION}`, status: "RC_FREEZE_PASS", passed, total: checks.length, checks }, null, 2));
