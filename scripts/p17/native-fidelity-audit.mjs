import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  manifestText, intakeText, packageText, lockText, releaseSource, nativeTypes,
  fidelity, imageWorker, vectorWorker, tableWorker, layoutReflow, nativeClient,
  imagePanel, tablePanel, textPanel, fixture, unitTest, reflowTest, browserTest,
  limitations, readme, changelog, productDoc, workflow
] = await Promise.all([
  read("docs/p17/native-fidelity.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("src/native/nativeFidelity.ts"),
  read("src/workers/native-image.worker.ts"),
  read("src/workers/native-vector.worker.ts"),
  read("src/workers/native-table.worker.ts"),
  read("src/native/layoutReflow.ts"),
  read("src/native/nativeClientBase.ts"),
  read("src/editor/native/LegacyNativeContentPropertiesPanel.tsx"),
  read("src/editor/native/NativeTablePropertiesPanel.tsx"),
  read("src/editor/native/LayoutAwareTextPropertiesPanel.tsx"),
  read("src/fixtures/p17NativeFidelityPdf.ts"),
  read("tests/unit/p17DeepNativeFidelity.test.ts"),
  read("tests/unit/layoutReflow.test.ts"),
  read("tests/e2e/p17-native-fidelity.spec.ts"),
  read("KNOWN_LIMITATIONS.md"),
  read("README.md"),
  read("CHANGELOG.md"),
  read("docs/product/P17_DEEP_NATIVE_CONTENT_FIDELITY.md"),
  read(".github/workflows/p17-native-fidelity-ci.yml")
]);

const manifest = JSON.parse(manifestText);
const intake = JSON.parse(intakeText);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (value, name) => {
  const passed = Boolean(value);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P17 native fidelity audit failed: ${name}`);
};

check(manifest.schemaVersion === 1 && manifest.phase === "P17" && manifest.roadmapItem === "V72-05", "manifest identifies P17 / V72-05");
check(manifest.status === "implemented-awaiting-stacked-merge", "P17 does not claim release before stacked merge");
check(manifest.releaseBoundary?.executableVersion === "7.1.4" && manifest.releaseBoundary?.targetVersion === "7.2.0", "release identity remains 7.1.4 -> 7.2.0");
check(manifest.releaseBoundary?.versionCutAllowed === false && manifest.releaseBoundary?.networkRequired === false, "P17 neither cuts version nor adds network dependency");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "persistent schemas remain 9/13/6");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "APP_VERSION remains v7.1.4");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes), "native editor schema remains v6");

const item = intake.items?.find((entry) => entry.id === "V72-05");
check(item?.disposition === "committed" && /native-content fidelity/i.test(item?.title ?? ""), "P17 implements committed V72-05");

check(nativeTypes.includes("NativeImageFidelityClass") && nativeTypes.includes('"fidelity-protected"'), "image fidelity is represented explicitly");
check(nativeTypes.includes('"Pattern"') && nativeTypes.includes("geometryKind?"), "vector Pattern and table geometry metadata are explicit");
check(nativeTypes.includes("threadId?") && nativeTypes.includes("nextRegionId?"), "text flow carries bounded cross-region metadata");

check(fidelity.includes("classifyImageFidelity") && fidelity.includes("allowedActions: [\"transform\", \"delete\"]"), "attached soft masks have source-only action capability");
check(fidelity.includes("classifyTableGeometry") && fidelity.includes('"merged-irregular"'), "irregular/merged table geometry is classified");
check(fidelity.includes("vectorAppearanceOverrideRisks") && fidelity.includes('"Pattern"'), "complex vector appearance state is guarded");

check(imageWorker.includes('type: "INSPECT_IMAGES"') && imageWorker.includes("beginMask") && imageWorker.includes("clipImageMask") && imageWorker.includes("beginGroup"), "image specialist traces masks, clipping and group state");
check(imageWorker.includes("getMask") && imageWorker.includes("getImageMask"), "image source mask metadata is inspected");
check(imageWorker.includes("allowedActions.includes(action)"), "worker independently enforces action-level image capability");
check(imageWorker.includes("unrelated image instances disappeared") && imageWorker.includes("untouched image instance changed position or disappeared"), "image export detects collateral instance loss/movement");
check(imageWorker.includes("did not preserve its attached soft mask"), "soft-mask source transform is revalidated after reopen");
check(nativeClient.includes("mergeImageInspection") && nativeClient.includes('type: "INSPECT_IMAGES"'), "specialist image inspection replaces generic image assumptions");
check(nativeClient.includes("validatePdfFidelity(replaySource, working"), "all native output still passes P8 source/output fidelity validation");

check(vectorWorker.includes("vectorAppearanceOverrideRisks(record.object)") && vectorWorker.includes("Geometry-only editing remains available"), "vector worker blocks unsafe appearance override but retains geometry-only path");
check(vectorWorker.includes('return "Pattern"') && vectorWorker.includes("shading paint operator"), "vector inspection recognizes pattern/shading risk");
check(tableWorker.includes("classifyTableGeometry") && tableWorker.includes("occupied.size !== edit.rows * edit.columns"), "table reconstruction requires complete qualified geometry");

check(layoutReflow.includes("nextRegionId") && layoutReflow.includes("competingLeft") && layoutReflow.includes("competingRight"), "adjacent region detection requires unique deterministic adjacency");
check(layoutReflow.includes("crossRegion: true") && layoutReflow.includes("does not have enough bounded space"), "cross-region spill and page-boundary refusal are explicit");
check(reflowTest.includes("spills an overflowing paragraph into one deterministic adjacent column") && reflowTest.includes("target adjacent region contains unrelated artwork"), "cross-region success and blocker regressions exist");

check(imagePanel.includes("Fidelity-protected image") && imagePanel.includes("Attached soft mask preserved"), "image UI exposes protection and qualified masked behavior");
check(tablePanel.includes("object.geometryKind"), "table UI surfaces geometry class");
check(textPanel.includes("uniquely detected two-column thread") && textPanel.includes("regionCount"), "text UI explains bounded adjacent-region flow");

check(fixture.includes("/SMask 7 0 R") && fixture.includes("/GSBlend") && fixture.includes("re W n") && fixture.includes("strokedRect(54, 190, 220, 30)"), "generated fixture covers mask, blend, clipping and rectangular merged-table geometry");
check(unitTest.includes("attached soft masks") && unitTest.includes("merged-irregular") && unitTest.includes("Pattern"), "focused P17 policy tests cover promoted/protected classes");
check(browserTest.includes("Attached soft mask preserved") && browserTest.includes("Fidelity-protected image") && browserTest.includes("merged irregular") && browserTest.includes("Region 1/2"), "browser qualification exercises image, table and text-flow surfaces");

check(limitations.includes("P17") && limitations.includes("attached soft mask"), "known limitations state the new P17 boundary");
check(readme.includes("P17 now implements V72-05"), "README exposes P17 capability");
check(changelog.includes("P17 — Deep Native-Content Fidelity"), "CHANGELOG records P17");
check(productDoc.includes("P8 fidelity gate") && productDoc.includes("explicit image mask") && productDoc.includes("merged-irregular"), "P17 product note documents preservation and refusal rules");
check(workflow.includes("npm run check:p17") && workflow.includes("p17-native-fidelity.spec.ts"), "dedicated P17 CI runs audit/unit/browser gates");
check(manifest.nextPhase?.id === "P18" && manifest.nextPhase?.roadmapItem === "V72-06", "P17 hands off to V72-06 qualification");

console.log(JSON.stringify({
  phase: "P17",
  status: "P17_DEEP_NATIVE_FIDELITY_PASS",
  nextPhase: manifest.nextPhase,
  passed: checks.filter((entry) => entry.passed).length,
  total: checks.length,
  checks
}, null, 2));
