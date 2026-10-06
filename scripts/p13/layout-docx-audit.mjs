import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  manifestText, p12Text, packageText, lockText, releaseSource, nativeSource,
  implementation, quick, catalog, directory, p13Doc, readme, limitations, changelog, workflow
] = await Promise.all([
  read("docs/p13/layout-docx.json"),
  read("docs/p12/feature-intake.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("src/professional/layoutDocx.ts"),
  read("src/quick/quickOperations.ts"),
  read("src/ia/taskCatalog.ts"),
  read("src/product/TaskDirectory.tsx"),
  read("docs/product/P13_LAYOUT_AWARE_DOCX.md"),
  read("README.md"),
  read("KNOWN_LIMITATIONS.md"),
  read("CHANGELOG.md"),
  read(".github/workflows/p13-layout-docx-ci.yml")
]);

const manifest = JSON.parse(manifestText);
const p12 = JSON.parse(p12Text);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (condition, name) => {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P13 DOCX audit failed: ${name}`);
};

check(manifest.schemaVersion === 1 && manifest.phase === "P13" && manifest.roadmapItem === "V72-01", "P13 manifest identifies the scoped v7.2 roadmap item");
check(manifest.status === "implemented-awaiting-stacked-merge", "P13 status does not pretend stacked work is released");
check(manifest.releaseBoundary?.executableVersion === "7.1.4" && manifest.releaseBoundary?.targetVersion === "7.2.0", "P13 preserves the pre-cut release identity");
check(manifest.releaseBoundary?.versionCutAllowed === false, "P13 cannot cut the v7.2 executable version");
check(JSON.stringify(manifest.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "P13 persistent formats remain frozen");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains atomically v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "runtime APP_VERSION remains v7.1.4");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "project/database schemas remain v9/v13");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeSource), "native editor schema remains v6");

const item = p12.items?.find((entry) => entry.id === "V72-01");
check(item?.disposition === "committed" && /DOCX/i.test(item?.title ?? ""), "P13 implements the committed P12 V72-01 item");
check(manifest.productContract?.localOnly === true && manifest.productContract?.remoteOfficeService === false, "DOCX conversion remains local and service-free");
check(manifest.productContract?.editableParagraphs === true && manifest.productContract?.commonEditableTables === true && manifest.productContract?.embeddedPageImages === true, "P13 commits editable paragraphs, tables and images");
check(manifest.productContract?.exactPdfLayoutClaim === false && manifest.productContract?.officeRoundTripClaim === false, "P13 explicitly rejects false exact-layout/Office-roundtrip claims");

check(implementation.includes('inspectNativePdf'), "P13 reuses native layout inspection");
check(implementation.includes('openPdfWithPdfJs'), "P13 uses local PDF.js rendering for qualified image appearance");
check(implementation.includes('kind: "table"') && implementation.includes("<w:tbl>"), "P13 emits editable Word tables");
check(implementation.includes("w:gridSpan") && implementation.includes("w:vMerge"), "P13 supports common merged table cells");
check(implementation.includes("word/media/") && implementation.includes("r:embed"), "P13 embeds image media with OOXML relationships");
check(implementation.includes("<w:pgSz") && implementation.includes("<w:pgMar"), "P13 represents page geometry and margins");
check(implementation.includes("<w:b/>") && implementation.includes("<w:i/>") && implementation.includes("<w:color"), "P13 represents supported direct text styling");
check(implementation.includes("MAX_DOCX_IMAGE_REGIONS = 48") && implementation.includes("MAX_RENDER_PIXELS = 6_000_000"), "P13 image work is bounded");
check(implementation.includes("Multi-column reading order was reconstructed heuristically"), "P13 discloses heuristic multi-column reading order");
check(implementation.includes("Vector artwork and nested PDF graphics are not converted"), "P13 discloses unsupported editable artwork conversion");

check(quick.includes('buildLayoutAwareDocx') && quick.includes('../professional/layoutDocx'), "Quick PDF to Word routes through the P13 builder");
check(!quick.includes('const { buildSimpleDocx } = await import("../professional/docx")'), "Quick PDF to Word no longer uses the text-only builder");
check(catalog.includes('id: "pdf-to-docx", label: "PDF to Word"') && !catalog.includes('label: "PDF to Word (text)"'), "consumer task label no longer advertises text-only conversion");
check(directory.includes("editable paragraphs, common tables, images, page geometry and supported styling"), "Office search messaging reflects the P13 capability boundary");
check(p13Doc.includes("The goal is not pixel-identical Office conversion") && p13Doc.includes("No PDF bytes, text, images, credentials, or output are uploaded"), "P13 documentation states fidelity and privacy boundaries");
check(readme.includes("layout-aware") && readme.includes("DOCX"), "README exposes layout-aware DOCX capability");
check(limitations.includes("DOCX export reconstructs editable paragraphs"), "known limitations reflect the new DOCX boundary");
check(changelog.includes("P13 — Layout-Aware PDF → DOCX Export 2.0"), "CHANGELOG records P13");
check(workflow.includes("npm run check:p13") && workflow.includes("docs/p13/**"), "P13 CI enforces the implementation contract");
check(manifest.nextPhase?.id === "P14" && manifest.nextPhase?.roadmapItem === "V72-02", "P13 hands off to P14 complex-script editing");

console.log(JSON.stringify({
  phase: "P13",
  status: "P13_LAYOUT_DOCX_PASS",
  roadmapItem: manifest.roadmapItem,
  report: manifest.productContract,
  nextPhase: manifest.nextPhase,
  passed: checks.filter((item) => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
