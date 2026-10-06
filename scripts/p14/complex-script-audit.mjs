import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  manifestText, p12Text, packageText, lockText, releaseSource, nativeTypes,
  model, complexScript, bidi, shaping, worker, panel, findReplace, limitations,
  readme, changelog, p14Doc, workflow
] = await Promise.all([
  read("docs/p14/complex-script.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("src/native/nativeModel.ts"),
  read("src/native/complexScript.ts"),
  read("src/native/complexBidi.ts"),
  read("src/workers/complexTextShaping.ts"),
  read("src/workers/native-editor.worker.ts"),
  read("src/editor/native/LayoutAwareTextPropertiesPanel.tsx"),
  read("src/editor/native/nativeFindReplace.ts"),
  read("KNOWN_LIMITATIONS.md"),
  read("README.md"),
  read("CHANGELOG.md"),
  read("docs/product/P14_COMPLEX_SCRIPT_TEXT.md"),
  read(".github/workflows/p14-complex-script-ci.yml")
]);

const manifest = JSON.parse(manifestText);
const p12 = JSON.parse(p12Text);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (value, name) => {
  const passed = Boolean(value);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P14 complex-script audit failed: ${name}`);
};

check(manifest.schemaVersion === 1 && manifest.phase === "P14" && manifest.roadmapItem === "V72-02", "P14 manifest identifies V72-02");
check(manifest.status === "implemented-awaiting-stacked-merge", "P14 does not claim release before stacked merge");
check(manifest.releaseBoundary?.executableVersion === "7.1.4" && manifest.releaseBoundary?.targetVersion === "7.2.0", "pre-cut release identity remains 7.1.4 → 7.2.0");
check(manifest.releaseBoundary?.versionCutAllowed === false, "P14 cannot cut the executable version");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "P14 schemas remain 9/13/6");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "APP_VERSION remains 7.1.4");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "project/database schemas remain frozen");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeTypes), "native editor schema remains v6");

const item = p12.items?.find((entry) => entry.id === "V72-02");
check(item?.disposition === "committed" && /Complex-script/i.test(item?.title ?? ""), "P14 implements committed V72-02");
check(manifest.qualifiedScripts?.length === 1 && manifest.qualifiedScripts[0]?.script === "arabic", "qualification matrix contains only Arabic");
check(manifest.qualifiedScripts[0]?.layoutAwareReflow === false && manifest.qualifiedScripts[0]?.bulkFindReplace === false, "Arabic reflow and bulk replacement remain fail-closed");
check(manifest.stillUnqualified?.some((item) => /Hebrew/.test(item)) && manifest.stillUnqualified?.some((item) => /Indic/.test(item)), "P14 does not claim universal complex-script support");

check(pkg.dependencies?.harfbuzzjs === "1.6.2" && pkg.dependencies?.["bidi-js"] === "1.1.0", "runtime shaping/bidi dependencies are pinned");
check(lock.packages?.["node_modules/harfbuzzjs"]?.version === "1.6.2", "harfbuzzjs lock entry matches");
check(lock.packages?.["node_modules/bidi-js"]?.version === "1.1.0", "bidi-js lock entry matches");

check(nativeTypes.includes('"arabic"') && nativeTypes.includes('"shaped-fixed-box"') && nativeTypes.includes('"imported-shaped"'), "native types expose bounded Arabic shaped reconstruction");
check(model.includes("detectQualifiedComplexScript") && model.includes('editability: "shaped-fixed-box"'), "native classification separates Arabic from generic complex scripts");
check(model.includes('if (script === "arabic") return "rtl"'), "Arabic paragraph direction is explicitly RTL");
check(complexScript.includes("QUALIFIED_COMPLEX_SCRIPT_MATRIX") && complexScript.includes("firstExplicitBidiControl"), "qualified script matrix and bidi-control guard exist");
check(complexScript.includes("Hebrew") === false, "Arabic qualification code does not silently promote Hebrew");

check(bidi.includes('from "bidi-js"') && bidi.includes("getEmbeddingLevels") && bidi.includes("getReorderedIndices") && bidi.includes("getMirroredCharactersMap"), "Unicode bidi engine controls levels, visual order and mirroring");
check(shaping.includes('from "harfbuzzjs"') && shaping.includes("hb.shape") && shaping.includes("getGlyphInfos") && shaping.includes("getGlyphPositions"), "HarfBuzz performs real glyph shaping");
check(shaping.includes("font.setScale") && shaping.includes("face.upem"), "HarfBuzz positions use deterministic font units");

check(worker.includes('edit.fontSource === "imported-shaped"') && worker.includes("shapeComplexText"), "native export routes shaped Arabic edits through P14");
check(worker.includes("pdf.addFont") && worker.includes("Identity-H"), "native export uses MuPDF Identity-H font path");
check(worker.includes("/ActualText") && worker.includes("utf16Hex(line.logicalText)"), "shaped visual output preserves logical Unicode through ActualText");
check(worker.includes("glyphHex") && worker.includes("gid.toString(16).padStart(4"), "shaped GIDs are emitted as two-byte CID values");
check(worker.includes("does not fit the fixed text region") && worker.includes("wider than the fixed text region"), "real shaped metrics fail closed on fixed-box overflow");

check(panel.includes('object.editability === "shaped-fixed-box"'), "text properties recognize shaped Arabic objects");
check(panel.includes('"imported-shaped"') && panel.includes("complexScriptReplacementIssue"), "Apply queues only validated shaped-font edits");
check(panel.includes("Boolean(fontBytes?.byteLength)") && panel.includes('fontValidation.phase === "ready"'), "Arabic Apply requires imported-font validation");
check(panel.includes("disabled={!object.flow || complex || shaped"), "Arabic layout-aware follower reflow stays disabled");
check(panel.includes("Qualified Arabic/RTL reconstruction"), "editor explains the qualified Arabic boundary");

check(findReplace.includes('object.editability === "shaped-fixed-box"') && findReplace.includes("bulk replacement is not applied automatically"), "bulk Arabic replacement stays manual");
check(limitations.includes("qualified **Arabic-script/RTL fixed-box path**") && limitations.includes("Hebrew, Indic"), "known limitations reflect the bounded P14 scope");
check(readme.includes("HarfBuzz shaping") && readme.includes("logical text preservation"), "README exposes qualified Arabic reconstruction");
check(changelog.includes("P14 — Complex-Script Existing-Text Editing"), "CHANGELOG records P14");
check(p14Doc.includes("P14 does not redefine “complex scripts” as universally editable") && p14Doc.includes("/ActualText"), "P14 documentation states scope and logical-text semantics");
check(workflow.includes("fonts-noto-core") && workflow.includes("P14_ARABIC_FONT_PATH") && workflow.includes("npm run check:p14"), "P14 CI executes a real Arabic-font shaping fixture");
check(manifest.nextPhase?.id === "P15" && manifest.nextPhase?.roadmapItem === "V72-03", "P14 hands off to target-size compression");

console.log(JSON.stringify({
  phase: "P14",
  status: "P14_COMPLEX_SCRIPT_PASS",
  qualifiedScripts: manifest.qualifiedScripts,
  nextPhase: manifest.nextPhase,
  passed: checks.filter((item) => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
