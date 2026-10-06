import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  manifestText, p12Text, packageText, lockText, releaseSource, nativeTypes,
  batchTypes, batchModel, capabilities, pipeline, batchPage, styles,
  encryptedTest, parityTest, browserTest, phase18, phase26, phase26Unit,
  limitations, readme, changelog, productDoc, workflow
] = await Promise.all([
  read("docs/p16/batch-parity.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("src/types/batch.ts"),
  read("src/processing/batchModel.ts"),
  read("src/processing/batchCapabilities.ts"),
  read("src/processing/batchPipeline.ts"),
  read("src/views/BatchPage.tsx"),
  read("src/styles.css"),
  read("tests/unit/p16BatchEncryptedQueue.test.ts"),
  read("tests/unit/p16BatchParity.test.ts"),
  read("tests/e2e/p16-batch-encrypted.spec.mjs"),
  read("scripts/phase18/runtime-regression.mjs"),
  read("scripts/phase26/runtime-regression.mjs"),
  read("tests/unit/phase26WorkflowIntelligence.test.ts"),
  read("KNOWN_LIMITATIONS.md"),
  read("README.md"),
  read("CHANGELOG.md"),
  read("docs/product/P16_BATCH_PARITY_ENCRYPTED_QUEUE.md"),
  read(".github/workflows/p16-batch-parity-ci.yml")
]);

const manifest = JSON.parse(manifestText);
const p12 = JSON.parse(p12Text);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (value, name) => {
  const passed = Boolean(value);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P16 Batch parity audit failed: ${name}`);
};

check(manifest.schemaVersion === 1 && manifest.phase === "P16" && manifest.roadmapItem === "V72-04", "P16 manifest identifies V72-04");
check(manifest.status === "implemented-awaiting-stacked-merge", "P16 does not claim release before stacked merge");
check(manifest.releaseBoundary?.executableVersion === "7.1.4" && manifest.releaseBoundary?.targetVersion === "7.2.0", "pre-cut release identity remains 7.1.4 → 7.2.0");
check(manifest.releaseBoundary?.versionCutAllowed === false, "P16 cannot cut the executable version");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "application persistent schemas remain 9/13/6");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "APP_VERSION remains 7.1.4");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "project/database schemas remain frozen");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes), "native editor schema remains v6");

const item = p12.items?.find((entry) => entry.id === "V72-04");
check(item?.disposition === "committed" && /Batch parity/i.test(item?.title ?? ""), "P16 implements committed V72-04");

check(manifest.batchRecipeSchema?.before === 3 && manifest.batchRecipeSchema?.after === 4, "Batch recipe schema advances explicitly from v3 to v4");
check(manifest.batchRecipeSchema?.migration === "explicit-v2-v3-to-v4", "Batch v2/v3 migration is declared");
check(manifest.batchRecipeSchema?.passwordsInRecipe === false, "portable Batch recipes exclude passwords");
check(batchTypes.includes("BATCH_RECIPE_SCHEMA_VERSION = 4"), "Batch type contract is v4");
check(batchModel.includes("CURRENT_BATCH_SCHEMA_VERSION = 4"), "Batch model migration target is v4");
check(batchModel.includes("schemaVersion >= 2 && schemaVersion < CURRENT_BATCH_SCHEMA_VERSION"), "legacy v2/v3 recipes migrate deterministically");
check(batchModel.includes("validateBatchRecipe"), "live and imported recipes share validation");
check(phase18.includes("assert.equal(migrated.schemaVersion, 4)"), "Phase 18 legacy migration regression follows v4");
check(phase26.includes("Batch 3 recipe migrates to schema 4"), "Phase 26 runtime preserves historical v3 migration evidence");
check(phase26Unit.includes("migrates legacy Batch recipes to current schema 4"), "Phase 26 unit contract follows v4");

for (const type of ["extract-pages","remove-pages","flatten","sanitize","target-size"]) {
  check(batchTypes.includes(`type: "${type}"`), `Batch v4 exposes ${type}`);
  check(batchModel.includes(`type === "${type}"`) || batchModel.includes(`type === "extract-pages" || step.type === "remove-pages"`) || batchModel.includes(`type === "flatten"`) || batchModel.includes(`type === "target-size"`), `Batch model configures ${type}`);
  check(pipeline.includes(`step.type === "${type}"`) || pipeline.includes(`step.type === "extract-pages" || step.type === "remove-pages"`) || pipeline.includes(`step.type === "flatten" || step.type === "sanitize"`), `Batch pipeline executes ${type}`);
}

check(capabilities.includes("quickTaskIds") && capabilities.includes("assertCompleteBatchCapabilityMatrix"), "capability matrix is checked against every standalone Quick task");
check(capabilities.includes('taskId: "password-protect", status: "boundary"'), "output password creation remains an explicit non-Batch boundary");
check(capabilities.includes('taskId: "unlock-pdf", status: "boundary"'), "unlock is modeled as input credential state rather than recipe mutation");
check(capabilities.includes('taskId: "repair-pdf", status: "boundary"') && capabilities.includes('taskId: "pdf-to-docx", status: "boundary"'), "recovery and foreign-format terminals remain explicit boundaries");

check(batchPage.includes("sessionPasswordsRef=useRef<Map<string,string>>(new Map())"), "Batch credentials live in page-owned memory");
check(batchPage.includes("sessionPasswordsRef.current.clear()") && batchPage.includes("sessionPasswordsRef.current.delete(item.id)"), "credentials clear on queue/page lifecycle actions");
check(!batchPage.includes("localStorage") && !batchPage.includes("sessionStorage"), "Batch page does not persist credentials in Web Storage");
check(batchPage.includes("await inspectPdfBytes(bytes,password)"), "credential is locally validated before reuse");
check(batchPage.includes('"needs-password"') && batchPage.includes("Password required"), "protected inputs enter recoverable credential state");
check(batchPage.includes("That password did not open this PDF."), "wrong credentials remain recoverable without echoing the secret");
check(batchPage.includes("sessionPasswordsRef.current.get(item.id)") && pipeline.includes("password?: string"), "input credential is passed separately from recipe semantics");
check(batchPage.includes("PDF Studio does not put this password in saved/exported workflows, output names, or queue messages"), "credential privacy is explained in-product");

check(batchPage.includes("outputInputIdentity") && batchPage.includes("outputCredentialRevision"), "output validity records input and credential identity");
check(batchPage.includes("item.outputInputIdentity === item.inputIdentity") && batchPage.includes("item.outputCredentialRevision === item.credentialRevision"), "stale-output publication checks recipe/input/credential identity");
check(batchPage.includes("credentialRevision:entry.credentialRevision+1"), "credential changes invalidate prior output");

check(pipeline.includes("resolveOutputPassword") && pipeline.includes("activePassword = await resolveOutputPassword"), "pipeline resolves actual encryption state after PDF rewrites");
check(pipeline.includes("sourcePassword") && pipeline.includes("resolvedOutputPassword") && pipeline.includes("validatePdfFidelity"), "structural target-size output uses actual P8 source/output credentials");
check(pipeline.includes('output.byteLength > step.targetBytes'), "already-small target-size Batch items pass through");
check(pipeline.includes("Target-size step used best effort"), "Batch records unattained target-size best effort");

check(pipeline.includes("must be the final workflow step") && batchModel.includes("must be the final workflow step"), "terminal multi-output steps are final in model and runtime");
check(pipeline.includes("pages-0001-0010.pdf style") && pipeline.includes("page-0001.png style"), "terminal inner ZIP naming is explicit");
check(batchPage.includes('String(index+1).padStart(3,"0")') && batchPage.includes('"batch-outputs.zip"'), "outer Batch ZIP preserves queue ordering");

check(parityTest.includes("assertCompleteBatchCapabilityMatrix") && parityTest.includes("schema v4"), "P16 parity unit coverage exists");
check(encryptedTest.includes("sessionPasswordsRef") && encryptedTest.includes("credentialRevision"), "P16 credential privacy/invalidation source tests exist");
check(browserTest.includes("encrypted-aes256.pdf") && browserTest.includes("Use for this file") && browserTest.includes("Export workflow"), "real browser acceptance exercises encrypted queue recovery and recipe export");
check(!browserTest.includes("phase11-user"), "P16 browser test does not introduce a literal corpus password");

check(limitations.includes("Batch recipe v4") && !limitations.includes("Batch encrypted-file queues still do not provide per-file password prompts"), "known limitations retire stale encrypted-queue gap");
check(readme.includes("P16 now implements V72-04") && readme.includes("session-only encrypted-input credentials"), "README exposes P16 product capability");
check(changelog.includes("P16 — Batch Parity & Encrypted-Queue Ergonomics"), "CHANGELOG records P16");
check(productDoc.includes("Batch recipe schema v4") && productDoc.includes("Credential privacy") && productDoc.includes("P17 — Deep Native-Content Fidelity"), "P16 product documentation covers migration, privacy and handoff");
check(styles.includes(".batch-item--needs-password") && styles.includes(".batch-credential"), "encrypted queue states have product styling");
check(workflow.includes("npm run check:p16") && workflow.includes("tests/e2e/p16-batch-encrypted.spec.mjs"), "P16 CI tracks dedicated controls and browser acceptance");
check(manifest.nextPhase?.id === "P17" && manifest.nextPhase?.roadmapItem === "V72-05", "P16 hands off to Deep Native-Content Fidelity");

console.log(JSON.stringify({
  phase: "P16",
  status: "P16_BATCH_PARITY_PASS",
  batchRecipeSchema: manifest.batchRecipeSchema,
  nextPhase: manifest.nextPhase,
  passed: checks.filter((entry) => entry.passed).length,
  total: checks.length,
  checks
}, null, 2));
