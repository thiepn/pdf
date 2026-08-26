import { readFile } from "node:fs/promises";

const checks = [];
function check(condition, name) {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`v7.0.0 universal editing regression failed: ${name}`);
}
const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

const packageJson = JSON.parse(await read("package.json"));
const release = await read("src/core/release.ts");
const editor = await read("src/views/EditorPage.tsx");
const nativeClient = await read("src/native/nativeClient.ts");
const nativeClientBase = await read("src/native/nativeClientBase.ts");
const nativeClientArchitecture = `${nativeClient}\n${nativeClientBase}`;
const model = await read("src/native/nativeModel.ts");
const layout = await read("src/editor/unifiedLayout.ts");
const image = await read("src/workers/native-image.worker.ts");
const vector = await read("src/workers/native-vector.worker.ts");
const table = await read("src/workers/native-table.worker.ts");
const complex = await read("src/workers/native-complex.worker.ts");
const fidelity = await read("src/fidelity/pdfFidelityClient.ts");
const releaseWorkflow = await read(".github/workflows/release.yml");

check(packageJson.version === "7.0.0" && release.includes('APP_VERSION = "7.0.0"'), "v7 release identity is synchronized");
check(release.includes("PROJECT_PACKAGE_VERSION = 9") && release.includes("DATABASE_SCHEMA_VERSION = 13"), "v7 retains qualified persistent formats");
check(/reconstructInspectionTextParagraphs/.test(model) && /layout-aware/i.test(await read("docs/P2_LAYOUT_AWARE_REFLOW_FONT_FIDELITY.md")), "P1/P2 existing text and reflow architecture remains present");
check(/APPLY_IMAGES/.test(image) && /sourceImageObject/.test(image), "P3 source image editing remains qualified");
check(/APPLY_VECTORS/.test(vector) && /sourceSignature/.test(vector), "P4 exact vector editing remains qualified");
check(/APPLY_TABLES/.test(table) && /table/i.test(table), "P5 structured table writer remains qualified");
check(/UnifiedLayoutItem/.test(layout) && /alignBounds/.test(layout) && /distributeBounds/.test(layout), "P6 unified mixed-object layout remains present");
check(/APPLY_COMPLEX/.test(complex) && /resourceName/.test(complex), "P7 nested Form XObject editing remains qualified");
check(/validatePdfFidelity/.test(fidelity) && fidelity.includes("const affectedSet = new Set(affected)") && fidelity.includes("semanticFingerprint(page, pageNumber, !affectedSet.has(pageNumber))"), "P8 fidelity certification remains bounded and active");
check(/applyNativeEdits/.test(nativeClientArchitecture) && /takeNativeExportReplay/.test(nativeClientArchitecture), "mixed overlay/native export replay architecture remains present");
check(/validatePdfFidelity/.test(editor) || /exportEditorPdf/.test(editor), "unified editor exports through qualified validation path");
check(packageJson.scripts?.["release:web"]?.includes("audit:p9:release-candidate"), "P9 freeze audit is part of the full release gate");
check(releaseWorkflow.includes('tags: ["v7.0.0"]') && releaseWorkflow.includes("Browser-qualify exact stable artifact"), "Stable publication is exact-tag and browser-qualified");

console.log(JSON.stringify({ name: "v7.0.0 Universal Editing release regression", passed: checks.length, total: checks.length, checks }, null, 2));
