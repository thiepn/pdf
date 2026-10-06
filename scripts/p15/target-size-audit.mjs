import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  manifestText, p12Text, packageText, lockText, releaseSource, nativeTypes,
  targetEngine, compressionPage, processingWorker, rasterCompression,
  limitations, everyday, readme, changelog, p15Doc, workflow, browserTest
] = await Promise.all([
  read("docs/p15/target-size-compression.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("src/processing/targetSizeCompression.ts"),
  read("src/views/CompressionPage.tsx"),
  read("src/workers/processing.worker.ts"),
  read("src/processing/rasterCompression.ts"),
  read("KNOWN_LIMITATIONS.md"),
  read("docs/EVERYDAY_PDF_WORKFLOWS.md"),
  read("README.md"),
  read("CHANGELOG.md"),
  read("docs/product/P15_TARGET_SIZE_COMPRESSION.md"),
  read(".github/workflows/p15-target-size-ci.yml"),
  read("tests/e2e/p15-target-size.spec.mjs")
]);

const manifest = JSON.parse(manifestText);
const p12 = JSON.parse(p12Text);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (value, name) => {
  const passed = Boolean(value);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P15 target-size audit failed: ${name}`);
};

check(manifest.schemaVersion === 1 && manifest.phase === "P15" && manifest.roadmapItem === "V72-03", "P15 manifest identifies V72-03");
check(manifest.status === "implemented-awaiting-stacked-merge", "P15 does not claim release before stacked merge");
check(manifest.releaseBoundary?.executableVersion === "7.1.4" && manifest.releaseBoundary?.targetVersion === "7.2.0", "pre-cut release identity remains 7.1.4 → 7.2.0");
check(manifest.releaseBoundary?.versionCutAllowed === false, "P15 cannot cut the executable version");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "P15 schemas remain 9/13/6");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "APP_VERSION remains 7.1.4");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "project/database schemas remain frozen");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes), "native editor schema remains v6");

const item = p12.items?.find((entry) => entry.id === "V72-03");
check(item?.disposition === "committed" && /target-size compression/i.test(item?.title ?? ""), "P15 implements committed V72-03");
check(manifest.targetContract?.minimumTargetBytes === 1, "positive-byte minimum target is explicit");
check(manifest.targetContract?.maximumAttempts === 6, "bounded attempt ceiling is six");
check(manifest.targetContract?.structurePassAlwaysFirst === true, "structure-preserving pass is mandatory first");
check(manifest.targetContract?.targetMetRequiresSmallerThanSource === true && manifest.targetContract?.targetMetRequiresAtOrBelowTarget === true, "target success requires actual reduction and requested size");
check(manifest.targetContract?.largerOutputCanBeSuccessful === false, "larger outputs cannot be successful compression");
check(manifest.targetContract?.networkRequired === false, "target-size compression stays browser-local");

check(targetEngine.includes("MIN_TARGET_SIZE_BYTES = 1"), "runtime accepts any positive byte target");
check(targetEngine.includes("MAX_TARGET_SIZE_ATTEMPTS = 1 + TARGET_SIZE_RASTER_PROFILES.length"), "runtime attempt bound is derived from one structural plus raster ladder");
for (const marker of ["dpi: 200", "dpi: 165", "dpi: 135", "dpi: 105", "dpi: 80"]) check(targetEngine.includes(marker), `raster ladder includes ${marker}`);
check(targetEngine.indexOf("await optimize(") < targetEngine.indexOf("for (let profileIndex"), "structural optimization executes before raster fallback");
check(targetEngine.includes('options.preservation === "preserve-structure"'), "strict preservation boundary exists");
check(targetEngine.includes("candidate.bytes.byteLength >= sourceBytes"), "non-improving candidate is excluded");
check(targetEngine.includes("structuralSmaller && structural.bytes.byteLength <= options.targetBytes"), "structural success checks reduction and target");
check(targetEngine.includes("smaller && rasterBytes.byteLength <= options.targetBytes"), "raster success checks reduction and target");
check(targetEngine.includes('outcome: "best-effort"') && targetEngine.includes('outcome: "refused"'), "unattainable targets expose best-effort/refusal states");
check(targetEngine.includes("The first result") === false, "runtime selection is implemented rather than documentation-only");
check(processingWorker.includes("compress-images=yes"), "first pass includes structure-preserving image/stream optimization");
check(rasterCompression.includes("buildJpegPdf"), "fallback uses existing explicit raster reconstruction boundary");

check(compressionPage.includes('type TargetUnit = "B" | "KB" | "MB"'), "UI accepts bytes, KB and MB");
check(compressionPage.includes('"preserve-structure"') && compressionPage.includes('"allow-raster"'), "UI exposes preservation preference");
check(compressionPage.includes("Source</dt>") && compressionPage.includes("Target</dt>") && compressionPage.includes("Best output</dt>") && compressionPage.includes("Attempts</dt>"), "UI shows before/target/output and attempt evidence");
check(compressionPage.includes("Target met") && compressionPage.includes("Best effort · target not reached") && compressionPage.includes("No smaller qualified output"), "UI distinguishes success, best effort and refusal");
check(compressionPage.includes("resultBytes.byteLength >= source.byteLength && mode === \"target\""), "UI has final larger-output fail-closed guard");

check(limitations.includes("Target-size compression") && limitations.includes("six bounded attempts"), "known limitations state target-size boundary");
check(everyday.includes("P15") && !everyday.includes("reliable target-size compression remain"), "stale everyday-workflow target-size gap is retired");
check(readme.includes("P15") && readme.includes("target-size compression"), "README exposes P15 target-size compression");
check(changelog.includes("P15 — Structure-Preserving Target-Size Compression"), "CHANGELOG records P15");
check(p15Doc.includes("A larger file is never labelled successful compression") && p15Doc.includes("At most six attempts"), "P15 documentation states honest success and bounded search");
check(workflow.includes("npm run check:p15") && workflow.includes("docs/p15/**") && workflow.includes("tests/e2e/p15-target-size.spec.mjs"), "P15 CI tracks dedicated controls and browser acceptance");
check(browserTest.includes("Compress to target") && browserTest.includes("output.length).toBeLessThanOrEqual(80_000)") && browserTest.includes("PDF structure preserved|Pages rasterized"), "browser acceptance verifies target bytes and preservation evidence");
check(manifest.nextPhase?.id === "P16" && manifest.nextPhase?.roadmapItem === "V72-04", "P15 hands off to Batch parity and encrypted queues");

console.log(JSON.stringify({
  phase: "P15",
  status: "P15_TARGET_SIZE_PASS",
  maximumAttempts: manifest.targetContract.maximumAttempts,
  nextPhase: manifest.nextPhase,
  passed: checks.filter((item) => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
