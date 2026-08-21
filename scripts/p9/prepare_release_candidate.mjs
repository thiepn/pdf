import { readFile, writeFile } from "node:fs/promises";

const VERSION = "7.0.0";
const OLD_VERSION = "6.1.0";

async function read(path) {
  return readFile(path, "utf8");
}

async function write(path, content) {
  await writeFile(path, content);
  console.log(`P9 updated ${path}`);
}

function replaceRequired(text, from, to, path) {
  if (!text.includes(from)) throw new Error(`P9 could not find required release marker in ${path}: ${from}`);
  return text.replace(from, to);
}

const packagePath = "package.json";
const packageJson = JSON.parse(await read(packagePath));
packageJson.version = VERSION;
packageJson.scripts["audit:p9:release-candidate"] = "node scripts/p9/release-candidate-audit.mjs";
packageJson.scripts["test:runtime:v7.0.0"] = "node --experimental-strip-types scripts/releases/v7.0.0/runtime-regression.mjs";
packageJson.scripts["test:v7.0.0"] = "npm run release:web && npm run test:runtime:v7.0.0";
if (!packageJson.scripts["release:web"].includes("audit:p9:release-candidate")) {
  packageJson.scripts["release:web"] = replaceRequired(
    packageJson.scripts["release:web"],
    "npm run test:runtime:v6.1.0 && npm run test:corpus:phase28",
    "npm run test:runtime:v6.1.0 && npm run audit:p9:release-candidate && npm run test:runtime:v7.0.0 && npm run test:corpus:phase28",
    packagePath
  );
}
await write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockPath = "package-lock.json";
const lock = JSON.parse(await read(lockPath));
lock.version = VERSION;
if (!lock.packages?.[""]) throw new Error("P9 requires the package-lock root entry.");
lock.packages[""].version = VERSION;
await write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const releaseSourcePath = "src/core/release.ts";
let releaseSource = await read(releaseSourcePath);
releaseSource = replaceRequired(releaseSource, `APP_VERSION = \"${OLD_VERSION}\"`, `APP_VERSION = \"${VERSION}\"`, releaseSourcePath);
await write(releaseSourcePath, releaseSource);

const readmePath = "README.md";
let readme = await read(readmePath);
readme = replaceRequired(
  readme,
  "**v6.1.0 is the Intuitiveness & Discoverability release candidate**: it keeps the mature v6 PDF engine and reliability work while simplifying how users find, understand, and move between tools.",
  "**v7.0.0 is the Universal Editing release candidate**: it promotes the P1–P8 existing-content engine, unified object manipulation, nested-content support, and fidelity certification into one feature-frozen release candidate.",
  readmePath
);
readme = replaceRequired(readme, "- **Version:** `6.1.0`", `- **Version:** \`${VERSION}\``, readmePath);
readme = replaceRequired(readme, "- **Stable promotion:** Qualified `v6.1.0` tag only", `- **Stable promotion:** Qualified \`v${VERSION}\` tag only`, readmePath);
readme = replaceRequired(
  readme,
  "Phase 30 established the stable-release qualification model. v6.0.1–v6.0.6 then hardened PWA updates, package validation, schema protection, browser storage, ingress durability, deletion safety, and release provenance. **v6.1.0 does not add PDF capabilities or change persistent formats.** It standardizes product vocabulary, removes duplicate navigation, makes Simple mode genuinely simple, groups editor tools, clarifies staged redaction, replaces technical OCR defaults with understandable quality presets, adds guided page-range examples, hides implementation terminology behind technical details, and expands the bundled offline Help system. Source builds still default to `release-candidate`; only the exact `v6.1.0` GitHub tag workflow builds with `VITE_RELEASE_CHANNEL=stable` after every hard gate passes.",
  "Phase 30 established the stable-release qualification model and v6.0.1–v6.1.0 hardened the production shell. **v7.0.0 is the first release candidate built around direct editing of existing PDF content.** P1–P8 add exact text editing with layout-aware reflow, source image manipulation, vector and table reconstruction, unified mixed-object layout, reusable nested Form XObject editing, and source-vs-output fidelity certification. Persistent project/package schema versions remain compatible with the v6 line. Source builds still default to `release-candidate`; only the exact `v7.0.0` GitHub tag workflow may build with `VITE_RELEASE_CHANNEL=stable` after every hard gate passes.",
  readmePath
);
readme = replaceRequired(
  readme,
  "- Capability labels distinguish native-safe, safe reconstruction, appearance-only, and unsupported edits\n",
  "- Capability labels distinguish native-safe, safe reconstruction, appearance-only, and unsupported edits\n- Layout-aware paragraph editing can expand or contract supported text while moving deterministic downstream followers instead of forcing every edit into its original box\n- Existing source images support direct move, resize, crop/fit, opacity, rotation, replacement, and deletion through the qualified image writer\n- Supported source vectors preserve path identity while exposing geometry, paint, stroke, dash, alpha, transform, and deletion controls\n- Detected structured tables support multi-cell editing, merge/rebuild, row/column geometry, and safe whole-table transforms\n- Mixed added/native selections share alignment, distribution, sizing, nudging, and page-relative layout operations without collapsing the underlying PDF object model\n- Reusable nested Form XObject instances can be transformed or removed independently without flattening their shared source content\n- P8 source/output fidelity certification fails closed on collateral page-geometry, untouched-content, form, attachment, outline, encryption, and metadata regressions\n",
  readmePath
);
await write(readmePath, readme);

const changelogPath = "CHANGELOG.md";
let changelog = await read(changelogPath);
if (!changelog.includes("## 7.0.0 — Universal Editing Release Candidate")) {
  const entry = `## 7.0.0 — Universal Editing Release Candidate\n\n- Promoted P1–P8 into one feature-frozen existing-content editing architecture.\n- Added exact existing-text editing with layout-aware paragraph reflow, font/style preservation evidence, and deterministic downstream movement for supported layouts.\n- Added direct source-image manipulation, exact vector-path editing, structured table reconstruction, and supported reusable nested Form XObject instance transforms/deletion.\n- Unified added editor objects and qualified source PDF objects under shared move, resize, alignment, distribution, rotation, and keyboard layout operations.\n- Added source-vs-output fidelity certification for page geometry, untouched sampled semantics, annotations/widgets, forms, attachments, outlines, labels, JavaScript presence, encryption state, core metadata, and compatibility-significant PDF container features.\n- Added a nine-class P8 compatibility corpus independently reopened by PyMuPDF and pypdf, plus Chromium/Firefox/WebKit editor/export regression coverage.\n- Preserved project package v9, database schema v13, and backward compatibility with supported v1–v9 project packages; v7 is a capability release, not a storage-format migration.\n- Froze v7.0.0 publication behind the P9 release-candidate audit, existing Phase 11–30 and v6 maintenance regressions, reproducible distribution checks, dependency/security gates, exact-artifact Playwright qualification, deployed smoke tests, and exact-tag Stable provenance.\n\n`;
  changelog = replaceRequired(changelog, "# Changelog\n\n", `# Changelog\n\n${entry}`, changelogPath);
  await write(changelogPath, changelog);
}

const releaseWorkflowPath = ".github/workflows/release.yml";
let releaseWorkflow = await read(releaseWorkflowPath);
releaseWorkflow = releaseWorkflow.replaceAll("v6.1.0", `v${VERSION}`).replaceAll("6.1.0", VERSION);
releaseWorkflow = releaseWorkflow.replaceAll("docs/releases/v7.0.0/intuitiveness-report.md", "docs/P9_RELEASE_CANDIDATE.md");
releaseWorkflow = replaceRequired(
  releaseWorkflow,
  "- name: Run frozen Phase 30 web release gate\n        run: npm run release:web",
  "- name: Run P9 release-candidate freeze audit\n        run: npm run audit:p9:release-candidate\n      - name: Run frozen Phase 30 web release gate\n        run: npm run release:web",
  releaseWorkflowPath
);
await write(releaseWorkflowPath, releaseWorkflow);

const deployWorkflowPath = ".github/workflows/deploy.yml";
let deployWorkflow = await read(deployWorkflowPath);
deployWorkflow = deployWorkflow.replaceAll("grep -F '6.1.0'", `grep -F '${VERSION}'`);
deployWorkflow = replaceRequired(
  deployWorkflow,
  "npm run test:runtime:v6.1.0\n          npm run audit:phase30:migrations",
  "npm run test:runtime:v6.1.0\n          npm run audit:p9:release-candidate\n          npm run test:runtime:v7.0.0\n          npm run audit:phase30:migrations",
  deployWorkflowPath
);
await write(deployWorkflowPath, deployWorkflow);

const ciPath = ".github/workflows/ci.yml";
let ci = await read(ciPath);
ci = replaceRequired(
  ci,
  "- name: Validate installed dependency tree\n        run: npm run audit:tree",
  "- name: Validate installed dependency tree\n        run: npm run audit:tree\n      - name: P9 release-candidate freeze audit\n        run: npm run audit:p9:release-candidate",
  ciPath
);
await write(ciPath, ci);

console.log(JSON.stringify({ phase: "P9", version: VERSION, status: "release-candidate metadata prepared" }, null, 2));
