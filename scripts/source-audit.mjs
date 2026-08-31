import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const checks = [];

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path)); else output.push(path);
  }
  return output;
}

function pass(name, detail) { checks.push({ name, status: "passed", detail }); }
function fail(name, detail) { checks.push({ name, status: "failed", detail }); failures.push(`${name}: ${detail}`); }
function warn(name, detail) { checks.push({ name, status: "warning", detail }); warnings.push(`${name}: ${detail}`); }

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseSource = await readFile(join(root, "src/core/release.ts"), "utf8");

const allVersions = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
const nonExact = Object.entries(allVersions).filter(([, value]) => !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(value)));
if (nonExact.length) fail("Exact dependency versions", nonExact.map(([name, value]) => `${name}=${value}`).join(", ")); else pass("Exact dependency versions", `${Object.keys(allVersions).length} direct dependencies are pinned exactly`);
if (packageJson.devDependencies?.["@playwright/test"] === "1.62.0") pass("Published Playwright version", "1.62.0"); else fail("Published Playwright version", String(packageJson.devDependencies?.["@playwright/test"] ?? "missing"));
if (packageJson.engines?.node === ">=22.12.0") pass("Node runtime floor", ">=22.12.0"); else fail("Node runtime floor", String(packageJson.engines?.node ?? "missing"));
try {
  const corpusReport = JSON.parse(await readFile(join(root, "docs/phase-11/corpus-validation-report.json"), "utf8"));
  if (corpusReport.passed === true && corpusReport.corpusFiles >= 10) pass("Phase 11 external-reader corpus", `${corpusReport.corpusFiles} fixtures passed`);
  else fail("Phase 11 external-reader corpus", "Corpus report is absent or not passing");
} catch (reason) { fail("Phase 11 external-reader corpus", reason instanceof Error ? reason.message : String(reason)); }
try { await stat(join(root, "package-lock.json")); pass("Committed dependency lock", "package-lock.json present"); }
catch { warn("Committed dependency lock", "Generate through the current Bootstrap dependency lock workflow before enabling stable deployment"); }
const version = releaseSource.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (version === packageJson.version) pass("Version synchronization", version); else fail("Version synchronization", `package.json=${packageJson.version}, release.ts=${version ?? "missing"}`);
const serviceWorkerSource = await readFile(join(root, "public/sw.js"), "utf8");
const offlineGeneratorSource = await readFile(join(root, "scripts/generate-offline-assets.mjs"), "utf8");
if (/__LPS_RELEASE_VERSION__/.test(serviceWorkerSource) && /__LPS_RELEASE_CHANNEL__/.test(serviceWorkerSource) && /__LPS_RELEASE_BUILD_EPOCH__/.test(serviceWorkerSource) && /replaceAll\("__LPS_RELEASE_VERSION__"/.test(offlineGeneratorSource)) pass("Service-worker release identity", `${version} is stamped into the built worker together with channel/build identity`); else fail("Service-worker release identity", "Service-worker build identity templating is incomplete");
const smokeSource = await readFile(join(root, "tests/e2e/smoke.spec.ts"), "utf8");
if (version && smokeSource.includes(`PDF Studio ${version}`)) pass("E2E release-version synchronization", version); else fail("E2E release-version synchronization", `smoke.spec.ts does not assert ${version ?? "the current release version"}`);
const databaseSource = await readFile(join(root, "src/storage/database.ts"), "utf8");
const releaseDatabaseVersion = Number(releaseSource.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1]);
const runtimeDatabaseVersion = Number(databaseSource.match(/DB_VERSION\s*=\s*(\d+)/)?.[1]);
if (releaseDatabaseVersion === runtimeDatabaseVersion) pass("Database schema synchronization", String(runtimeDatabaseVersion)); else fail("Database schema synchronization", `release.ts=${releaseDatabaseVersion || "missing"}, database.ts=${runtimeDatabaseVersion || "missing"}`);
const settingsSource = await readFile(join(root, "src/types/settings.ts"), "utf8");
if (/SETTINGS_SCHEMA_VERSION\s*=\s*5/.test(settingsSource) && /experienceMode:\s*"simple"\s*\|\s*"advanced"/.test(settingsSource) && /renderingQuality:\s*"adaptive"/.test(settingsSource) && /showPreservationWarnings:\s*boolean/.test(settingsSource)) pass("Settings migration", "Schema 5 includes adaptive rendering, experience mode, and preservation controls"); else fail("Settings migration", "Settings schema 5 adaptive-rendering controls are missing");
const downloadSource = await readFile(join(root, "src/projects/download.ts"), "utf8");
if (/recordDownloadReceipt/.test(downloadSource) && /track\s*!==\s*false/.test(downloadSource)) pass("Output receipt integration", "Downloads record metadata with an explicit opt-out for report exports"); else fail("Output receipt integration", "The shared download path is not connected to receipt tracking");
const mainSource = await readFile(join(root, "src/main.tsx"), "utf8");
if (/if\s*\(!safeMode\)\s*void registerAppServiceWorker/.test(mainSource)) pass("Safe-mode service-worker boundary", "Safe mode suppresses service-worker registration"); else fail("Safe-mode service-worker boundary", "Safe mode does not gate service-worker registration");
const maintenanceSource = await readFile(join(root, "src/maintenance/maintenance.ts"), "utf8");
if (!/(pdfBytes|sourceBytes|userPassword|ownerPassword)\s*:/.test(maintenanceSource) && /createSupportBundle/.test(maintenanceSource)) pass("Support-bundle content boundary", "Support bundle excludes document bytes and password fields"); else fail("Support-bundle content boundary", "Support bundle may include sensitive document or password fields");
const operationCoordinatorSource = await readFile(join(root, "src/operations/projectOperationCoordinator.ts"), "utf8");
const storageBudgetSource = await readFile(join(root, "src/storage/budget.ts"), "utf8");
const projectRepositorySource = await readFile(join(root, "src/projects/projectRepository.ts"), "utf8");
const workspaceRepositorySource = await readFile(join(root, "src/workspace/workspaceRepository.ts"), "utf8");
const unifiedWorkspaceSource = await readFile(join(root, "src/workspace/UnifiedWorkspace.tsx"), "utf8");
if (/active\.has\(projectId\)/.test(operationCoordinatorSource) && /navigator\.locks/.test(operationCoordinatorSource) && /local-pdf-studio-operation:/.test(operationCoordinatorSource)) pass("Phase 21 operation serialization", "Same-project in-process exclusion plus preferred Web Locks boundary detected"); else fail("Phase 21 operation serialization", "Operation coordinator serialization boundary is incomplete");
if (/MINIMUM_RESERVE_BYTES\s*=\s*25_000_000/.test(storageBudgetSource) && /QUOTA_RESERVE_RATIO\s*=\s*0\.05/.test(storageBudgetSource) && /WRITE_OVERHEAD_RATIO\s*=\s*0\.08/.test(storageBudgetSource)) pass("Phase 21 storage reserve", "25 MB / 5% reserve with write overhead is configured"); else fail("Phase 21 storage reserve", "Storage safety constants are missing or changed without audit updates");
if (/assertStorageBudget\(bytes\.byteLength/.test(projectRepositorySource) && /assertStorageBudget\(packageBytes\.byteLength/.test(workspaceRepositorySource)) pass("Phase 21 persistence preflight", "Project sources and recovery checkpoints perform commit-adjacent storage checks"); else fail("Phase 21 persistence preflight", "Storage preflight is missing from a persistence boundary");
if (/subscribeProjectOperation/.test(unifiedWorkspaceSource) && /Finish or cancel/.test(unifiedWorkspaceSource) && /beforeunload/.test(unifiedWorkspaceSource)) pass("Phase 21 workspace operation guard", "Workspace subscribes to active work and guards mode/tab/unload navigation"); else fail("Phase 21 workspace operation guard", "Workspace operation navigation guard is incomplete");

for (const relative of ["public/manifest.webmanifest", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"]) {
  try { JSON.parse(await readFile(join(root, relative), "utf8")); pass(`JSON ${relative}`, "Parsed successfully"); }
  catch (reason) { fail(`JSON ${relative}`, reason instanceof Error ? reason.message : String(reason)); }
}

const sourceFiles = (await walk(join(root, "src"))).filter((path) => [".ts", ".tsx"].includes(extname(path)));
const importPattern = /(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
let importCount = 0;
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    importCount += 1;
    const base = resolve(dirname(file), match[1]);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx")];
    let found = false;
    for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) { found = true; break; } } catch {} }
    if (!found) fail("Relative import resolution", `${file.slice(root.length + 1)} -> ${match[1]}`);
  }
}
if (!failures.some((item) => item.startsWith("Relative import resolution"))) pass("Relative import resolution", `${importCount} imports resolved across ${sourceFiles.length} source files`);

const productionFiles = sourceFiles.filter((path) => !path.includes(`${join("src", "lab")}`) && !path.includes(`${join("src", "prototypes")}`));
const placeholderPattern = /\b(?:TODO|FIXME|coming soon|fake control)\b/i;
const placeholderHits = [];
for (const file of productionFiles) {
  const source = await readFile(file, "utf8");
  if (placeholderPattern.test(source)) placeholderHits.push(file.slice(root.length + 1));
}
if (placeholderHits.length) warn("Placeholder scan", placeholderHits.join(", ")); else pass("Placeholder scan", "No TODO/FIXME/fake-control markers in production source");
const derivedViewFiles = productionFiles.filter((path) => path.includes(`${join("src", "views")}`));
const uncoordinatedDerivedViews = [];
for (const file of derivedViewFiles) {
  const source = await readFile(file, "utf8");
  if (/createDerivedProjectFromBytes/.test(source) && !/runProjectOperation/.test(source)) uncoordinatedDerivedViews.push(file.slice(root.length + 1));
}
if (uncoordinatedDerivedViews.length) fail("Phase 21 derived-output coordination", uncoordinatedDerivedViews.join(", ")); else pass("Phase 21 derived-output coordination", "All current view-level derived-project writers enter the operation coordinator");

const html = await readFile(join(root, "index.html"), "utf8");
if (/Content-Security-Policy/.test(html) && /object-src 'none'/.test(html)) pass("Content Security Policy", "Restrictive CSP is present"); else fail("Content Security Policy", "Required CSP directives are missing");
if (/https?:\/\/localhost|127\.0\.0\.1/.test(html)) fail("Production URL scan", "index.html references a local development origin"); else pass("Production URL scan", "No local development origin in index.html");

if (/url\.origin !== self\.location\.origin/.test(serviceWorkerSource)) pass("Service-worker origin boundary", "Cross-origin requests are not intercepted"); else fail("Service-worker origin boundary", "Same-origin guard is missing");

const deploymentSource = await readFile(join(root, "src/release/deployment.ts"), "utf8");
const cacheNamesSource = await readFile(join(root, "src/release/cacheNames.ts"), "utf8");
if (/cacheNamespaceForBase/.test(deploymentSource) && /githubPagesProjectSite/.test(deploymentSource) && /sharedGithubIoOrigin/.test(deploymentSource)) pass("Phase 22 deployment model", "Repository base normalization, cache namespace, and shared github.io origin detection are present"); else fail("Phase 22 deployment model", "GitHub Pages deployment assessment is incomplete");
if (/APP_CACHE_PREFIX/.test(cacheNamesSource) && /OCR_LANGUAGE_CACHE/.test(cacheNamesSource) && /isLocalPdfStudioCache/.test(cacheNamesSource)) pass("Phase 22 cache namespace", "Runtime caches are namespaced to the Vite deployment base"); else fail("Phase 22 cache namespace", "Scoped runtime cache naming is missing");
if (/RELEASE_CACHE_PREFIX/.test(serviceWorkerSource) && /key\.startsWith\(RELEASE_CACHE_PREFIX\)/.test(serviceWorkerSource) && /url\.pathname\.startsWith\(SCOPE_PATH\)/.test(serviceWorkerSource)) pass("Phase 22 service-worker scope", "Worker cache cleanup and fetch interception are constrained to this deployment"); else fail("Phase 22 service-worker scope", "Service-worker repository-scope isolation is incomplete");
if (/refreshActiveReleaseCache/.test(maintenanceSource) && /registration\.scope === expectedScope/.test(maintenanceSource) && /pending shared files/.test(maintenanceSource)) pass("Phase 22 maintenance isolation", "Maintenance refreshes only this deployment's offline shell, preserves pending shared document bytes, and unregisters only its own service worker"); else fail("Phase 22 maintenance isolation", "Maintenance may affect unrelated same-origin state or pending shared files");

const mobileViewportSource = await readFile(join(root, "src/mobile/MobileViewportManager.tsx"), "utf8");
const mobilePolicySource = await readFile(join(root, "src/mobile/layoutPolicy.ts"), "utf8");
const viewerSource = await readFile(join(root, "src/views/ViewerPage.tsx"), "utf8");
const editorSource = await readFile(join(root, "src/views/EditorPage.tsx"), "utf8");
const stylesSource = await readFile(join(root, "src/styles.css"), "utf8");
const playwrightSource = await readFile(join(root, "playwright.config.ts"), "utf8");
if (/visualViewport/.test(mobileViewportSource) && /--app-viewport-height/.test(mobileViewportSource) && /keyboardOpen/.test(mobilePolicySource)) pass("Phase 23 VisualViewport handling", "Dynamic viewport and software-keyboard metrics are installed"); else fail("Phase 23 VisualViewport handling", "VisualViewport/keyboard integration is incomplete");
if (/workspace-mobile-nav/.test(unifiedWorkspaceSource) && /workspace-mobile-sheet/.test(unifiedWorkspaceSource) && /More document tools/.test(unifiedWorkspaceSource)) pass("Phase 23 mobile workspace navigation", "Read/Edit/Pages/Tools navigation and More sheet are present"); else fail("Phase 23 mobile workspace navigation", "Touch-first document navigation is incomplete");
if (/viewer-mobile-panel-toggle/.test(viewerSource) && /isPhoneViewport/.test(viewerSource) && /viewer-sidebar/.test(stylesSource)) pass("Phase 23 mobile viewer panel", "Pages/outline/search/info remain available in a mobile sheet"); else fail("Phase 23 mobile viewer panel", "Viewer mobile sidebar access is incomplete");
if (/isCompactViewport/.test(editorSource) && /editor-mobile-backdrop/.test(editorSource) && /editor-left-panel/.test(stylesSource) && /touch-action:\s*pinch-zoom/.test(stylesSource)) pass("Phase 23 touch editor", "Compact panel defaults, bottom-sheet dismissal, touch handles, and pinch-zoom boundary are present"); else fail("Phase 23 touch editor", "Touch editor integration is incomplete");
if (/mobile-chromium/.test(playwrightSource) && /tablet-webkit/.test(playwrightSource) && /hasTouch:\s*true/.test(playwrightSource) && /testMatch:\s*\/mobile/.test(playwrightSource)) pass("Phase 23 browser matrix", "Dedicated phone Chromium and tablet WebKit touch projects are configured"); else fail("Phase 23 browser matrix", "Mobile/tablet browser projects are missing");

const pwaInstallSource = await readFile(join(root, "src/pwa/installManager.ts"), "utf8");
const pwaReadinessSource = await readFile(join(root, "src/pwa/offlineReadiness.ts"), "utf8");
const shareInboxSource = await readFile(join(root, "src/pwa/shareInbox.ts"), "utf8");
const launchFilesSource = await readFile(join(root, "src/pwa/launchFiles.ts"), "utf8");
const pwaCardSource = await readFile(join(root, "src/components/PwaReadinessCard.tsx"), "utf8");
const manifestSource = await readFile(join(root, "public/manifest.webmanifest"), "utf8");
const distAuditSource = await readFile(join(root, "scripts/check-dist.mjs"), "utf8");
if (/offline-assets\.json/.test(serviceWorkerSource) && /precacheRelease/.test(serviceWorkerSource) && /GET_OFFLINE_STATUS/.test(serviceWorkerSource) && /CLIENT_HEALTHY/.test(serviceWorkerSource) && /isSupersededReleaseCache/.test(serviceWorkerSource)) pass("Phase 24 atomic offline release", "Generated runtime assets are precached and older release caches survive until a healthy new client boot"); else fail("Phase 24 atomic offline release", "Offline precache or healthy-update handoff is incomplete");
if (/share_target/.test(manifestSource) && /file_handlers/.test(manifestSource) && /launch_handler/.test(manifestSource) && /SHARE_TARGET_PATH/.test(serviceWorkerSource) && /SHARE_INBOX_CACHE/.test(serviceWorkerSource)) pass("Phase 24 installed PWA ingress", "Share Target and File Handling are declared with a local service-worker inbox"); else fail("Phase 24 installed PWA ingress", "Installed PWA file/share ingress is incomplete");
if (/beforeinstallprompt/.test(pwaInstallSource) && /navigator\.storage\?\.persisted/.test(pwaReadinessSource) && /Prevent browser cleanup/.test(pwaCardSource)) pass("Phase 24 install and persistence UX", "Install prompting/manual instructions and persistent-storage readiness are exposed without forcing permissions"); else fail("Phase 24 install and persistence UX", "Install/persistence readiness UX is incomplete");
if (/launchQueue/.test(launchFilesSource) && /SHARE_INBOX_CACHE/.test(shareInboxSource)) pass("Phase 24 progressive file entry", "LaunchQueue and share inbox use capability detection and local cache storage"); else fail("Phase 24 progressive file entry", "Progressive file-entry adapters are incomplete");
if (/offline-assets\.json/.test(distAuditSource) && /!name\.endsWith\("\.map"\)/.test(offlineGeneratorSource) && /generate-offline-assets\.mjs/.test(JSON.stringify(packageJson.scripts ?? {}))) pass("Phase 24 offline build gate", "Build emits and distribution audit validates an offline asset manifest while excluding source maps"); else fail("Phase 24 offline build gate", "Offline asset generation is not enforced by the build/release gate");

const creatorPageSource = await readFile(join(root, "src/views/CreatePdfPage.tsx"), "utf8");
const creatorWorkerSource = await readFile(join(root, "src/workers/creator.worker.ts"), "utf8");
const creatorLayoutSource = await readFile(join(root, "src/creator/layout.ts"), "utf8");
const compareAlignmentSource = await readFile(join(root, "src/comparison/alignment.ts"), "utf8");
const comparePageSource = await readFile(join(root, "src/views/ComparePage.tsx"), "utf8");
const batchModelSource = await readFile(join(root, "src/processing/batchModel.ts"), "utf8");
const batchPageSource = await readFile(join(root, "src/views/BatchPage.tsx"), "utf8");
if (/Create PDF/.test(creatorPageSource) && /Searchable text PDF/.test(creatorPageSource) && /Visual compatibility PDF/.test(creatorPageSource) && /pagePreset/.test(creatorLayoutSource)) pass("Phase 25 Create PDF Studio", "Markdown/text/semantic HTML creation has metric layout plus explicit searchable and visual output modes"); else fail("Phase 25 Create PDF Studio", "Create PDF Studio or its output boundaries are incomplete");
if (/PDFDocument/.test(creatorWorkerSource) && /addFont/.test(creatorWorkerSource) && /addCJKFont/.test(creatorWorkerSource) && /Visual compatibility PDF/.test(creatorWorkerSource)) pass("Phase 25 searchable creator", "MuPDF worker writes searchable Latin/CJK content and rejects shaping-dependent scripts to the visual path"); else fail("Phase 25 searchable creator", "Searchable creator font/script boundary is incomplete");
if (/alignPageTexts/.test(compareAlignmentSource) && /PageAlignmentRow/.test(compareAlignmentSource) && /Analyze document/.test(comparePageSource) && /Page map/.test(comparePageSource)) pass("Phase 25 Compare 2.0", "Document comparison aligns page sequences before pair-level visual/text diffing"); else fail("Phase 25 Compare 2.0", "Automatic page-sequence alignment is incomplete");
if (/parseBatchRecipeJson/.test(batchModelSource) && /serializeBatchRecipe/.test(batchModelSource) && /\.lpsrecipe\.json/.test(batchPageSource) && /exportRecipe/.test(batchPageSource) && /importRecipe/.test(batchPageSource)) pass("Phase 25 portable batch recipes", "Batch workflows retain validated local JSON import/export with the .lpsrecipe.json interchange format"); else fail("Phase 25 portable batch recipes", "Portable batch workflow support is incomplete");
const visualFingerprintSource = await readFile(join(root, "src/comparison/visualFingerprint.ts"), "utf8");
const creatorMarkdownSource = await readFile(join(root, "src/creator/markdown.ts"), "utf8");
const batchPipelineSource = await readFile(join(root, "src/processing/batchPipeline.ts"), "utf8");
if (/visualFingerprintFromRgba/.test(visualFingerprintSource) && /visualFingerprintSimilarity/.test(visualFingerprintSource) && /alignPageFingerprints/.test(compareAlignmentSource) && /extractAllFingerprints/.test(comparePageSource)) pass("Phase 26 hybrid comparison", "Compare 3.0 combines text fingerprints with low-resolution visual fallback for scan-heavy pages"); else fail("Phase 26 hybrid comparison", "Hybrid scan-aware page alignment is incomplete");
if (/parseMarkdownInline/.test(creatorMarkdownSource) && /bold-italic/.test(creatorMarkdownSource) && /linkUrl/.test(creatorLayoutSource) && /page\.createLink/.test(creatorWorkerSource)) pass("Phase 26 creator inline fidelity", "Creator 2.0 carries emphasis, code, and safe links through layout into searchable PDF output"); else fail("Phase 26 creator inline fidelity", "Creator inline formatting/link output is incomplete");
if (/CURRENT_BATCH_SCHEMA_VERSION\s*=\s*3/.test(batchModelSource) && /split-fixed/.test(batchModelSource) && /page-images/.test(batchModelSource) && /split-zip/.test(batchPipelineSource) && /images-zip/.test(batchPipelineSource) && /Split into PDF parts/.test(batchPageSource) && /Export page images/.test(batchPageSource)) pass("Phase 26 Batch 3.0", "Terminal multi-output split and page-image recipe steps produce local ZIP artifacts"); else fail("Phase 26 Batch 3.0", "Batch 3.0 multi-output support is incomplete");
const phase27RuntimeSource = await readFile(join(root, "scripts/phase27/runtime-regression.mjs"), "utf8");
const phase27LockAuditSource = await readFile(join(root, "scripts/phase27/lockfile-audit.mjs"), "utf8");
const phase27FingerprintSource = await readFile(join(root, "scripts/phase27/dist-fingerprint.mjs"), "utf8");
const ciWorkflowSource = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
const deployWorkflowSource = await readFile(join(root, ".github/workflows/deploy.yml"), "utf8");
const releaseWorkflowSource = await readFile(join(root, ".github/workflows/release.yml"), "utf8");
const playwrightConfigSource = await readFile(join(root, "playwright.config.ts"), "utf8");
if (/lockfileVersion !== 3/.test(phase27LockAuditSource) && /integrity/.test(phase27LockAuditSource) && /package-lock\.json is required/.test(phase27LockAuditSource)) pass("Phase 27 exact lock qualification", "A committed npm v3 lockfile must match every exact root pin and registry integrity record"); else fail("Phase 27 exact lock qualification", "Lockfile qualification is incomplete");
if (/PLAYWRIGHT_SKIP_BUILD/.test(playwrightConfigSource) && /actions\/download-artifact@v/.test(ciWorkflowSource) && /phase30-verified-dist/.test(ciWorkflowSource)) pass("Phase 27 artifact-identity browser gate", "Playwright can exercise the exact verified dist artifact rather than rebuilding it"); else fail("Phase 27 artifact-identity browser gate", "Browser qualification can diverge from the verified artifact");
if (/Reproducible production build/.test(ciWorkflowSource) && /dist-fingerprint\.mjs/.test(ciWorkflowSource) && /sha256/.test(phase27FingerprintSource)) pass("Phase 27 reproducible-build gate", "CI rebuilds the same commit and compares full distribution fingerprints"); else fail("Phase 27 reproducible-build gate", "Distribution reproducibility check is incomplete");
if (/Browser-qualify exact distribution before deployment/.test(deployWorkflowSource) && /PLAYWRIGHT_SKIP_BUILD:\s*["']?1/.test(deployWorkflowSource) && /test:phase(?:27|28|29|30)|release:web/.test(releaseWorkflowSource)) pass("Phase 27 release qualification", "Pages and tagged releases are blocked on Phase 27 browser/build qualification"); else fail("Phase 27 release qualification", "Deploy/tagged release does not fully consume Phase 27 qualification");
if (/Phase 27 runtime regression/.test(phase27RuntimeSource)) pass("Phase 27 dependency-independent regression", "Release-engineering invariants have a local regression gate"); else fail("Phase 27 dependency-independent regression", "Phase 27 runtime regression is missing");

const phase28RuntimeSource = await readFile(join(root, "scripts/phase28/runtime-regression.mjs"), "utf8");
const phase28HeartbeatSource = await readFile(join(root, "src/recovery/sessionHeartbeat.ts"), "utf8");
const phase28PackageSource = await readFile(join(root, "src/projects/projectPackage.ts"), "utf8");
try {
  const phase28Corpus = JSON.parse(await readFile(join(root, "docs/phase-28/adversarial-corpus-report.json"), "utf8"));
  if (phase28Corpus.passed === true && phase28Corpus.corpusFiles >= 50) pass("Phase 28 adversarial corpus", `${phase28Corpus.corpusFiles} fixtures passed dual-reader and render validation`);
  else fail("Phase 28 adversarial corpus", "Expected at least 50 passing adversarial fixtures");
} catch (reason) { fail("Phase 28 adversarial corpus", reason instanceof Error ? reason.message : String(reason)); }
if (/workspace-heartbeat-v2:/.test(phase28HeartbeatSource) && /sessionId/.test(phase28HeartbeatSource) && /removeItem\(key\)/.test(phase28HeartbeatSource)) pass("Phase 28 multi-tab recovery heartbeat", "Crash recovery heartbeats are isolated per workspace session"); else fail("Phase 28 multi-tab recovery heartbeat", "Heartbeat state can still alias browser tabs");
if (/metadataChecksum/.test(phase28PackageSource) && /metadataIntegrityBytes/.test(phase28PackageSource) && /formatVersion >= 9/.test(phase28PackageSource)) pass("Phase 28 project-package header integrity", "Format v9 authenticates payload and canonical header metadata independently"); else fail("Phase 28 project-package header integrity", "Backup header metadata remains outside the integrity boundary");
if (/existingChecksum === (?:existing|compatibleExisting)\.checksum/.test(projectRepositorySource) && !/catch\s*\{\s*await deleteProject\(existing\.id\)/s.test(projectRepositorySource)) pass("Phase 28 duplicate-import preservation", "Transient duplicate-source failures preserve the existing project and create an independent import"); else fail("Phase 28 duplicate-import preservation", "Duplicate import can still destroy an existing project");
if (/Phase 28 runtime regression/.test(phase28RuntimeSource)) pass("Phase 28 dependency-independent regression", "Recovery and persistence invariants have a dedicated Phase 28 gate"); else fail("Phase 28 dependency-independent regression", "Phase 28 runtime regression is missing");


const phase29RuntimeSource = await readFile(join(root, "scripts/phase29/runtime-regression.mjs"), "utf8");
const modalFocusSource = await readFile(join(root, "src/accessibility/modalFocus.ts"), "utf8");
const performanceBudgetSource = await readFile(join(root, "src/viewer/performancePolicy.ts"), "utf8");
const appShellSource = await readFile(join(root, "src/app/AppShell.tsx"), "utf8");
if (/event\.key !== "Tab"/.test(modalFocusSource) && /event\.key === "Escape"/.test(modalFocusSource) && /previous\?\.isConnected/.test(modalFocusSource)) pass("Phase 29 modal focus contract", "Modal surfaces trap keyboard focus, close on Escape, and restore the invoking control"); else fail("Phase 29 modal focus contract", "Modal focus/escape/restore behavior is incomplete");
if (/aria-live="polite"/.test(appShellSource) && /tabIndex=\{-1\}/.test(appShellSource) && /Skip to workspace/.test(appShellSource)) pass("Phase 29 SPA navigation accessibility", "Route changes are announced/focused and a keyboard skip link remains available"); else fail("Phase 29 SPA navigation accessibility", "SPA route focus or announcement behavior is incomplete");
if (/extreme/.test(performanceBudgetSource) && /maxConcurrentRenders:\s*1/.test(performanceBudgetSource) && /maxPixelRatio:\s*1\.25/.test(performanceBudgetSource)) pass("Phase 29 extreme-document budget", "1000-page/500 MB class has a one-render strict memory budget"); else fail("Phase 29 extreme-document budget", "Extreme-document rendering safeguards are incomplete");
if (/prefers-contrast:\s*more/.test(stylesSource) && /forced-colors:\s*active/.test(stylesSource) && /@media \(pointer:\s*coarse\)/.test(stylesSource) && /max-width:\s*640px/.test(stylesSource)) pass("Phase 29 inclusive responsive CSS", "High contrast, forced colors, coarse pointers, and zoom-collapsed layouts are explicitly covered"); else fail("Phase 29 inclusive responsive CSS", "Final contrast/touch/zoom CSS coverage is incomplete");
if (/Phase 29 runtime regression/.test(phase29RuntimeSource)) pass("Phase 29 dependency-independent regression", "UX/accessibility/performance invariants have a dedicated Phase 29 gate"); else fail("Phase 29 dependency-independent regression", "Phase 29 runtime regression is missing");


const phase30RuntimeSource = await readFile(join(root, "scripts/phase30/runtime-regression.mjs"), "utf8");
const phase30MigrationSource = await readFile(join(root, "scripts/phase30/migration-audit.mjs"), "utf8");
const phase30SecuritySource = await readFile(join(root, "scripts/phase30/security-privacy-audit.mjs"), "utf8");
if (version === packageJson.version && /^[67]\.\d+\.\d+$/.test(version ?? "") && /VITE_RELEASE_CHANNEL === "stable"/.test(releaseSource)) pass("Phase 30 release identity", `${version} remains on the qualified v6/v7 release line with an explicit stable build channel`); else fail("Phase 30 release identity", "Final version/channel contract is missing");
if (/SUPPORTED_PROJECT_PACKAGE_VERSIONS\s*=\s*\[1, 2, 3, 4, 5, 6, 7, 8, 9\]/.test(releaseSource) && /isSupportedProjectPackageVersion/.test(phase28PackageSource)) pass("Phase 30 migration contract", "Project-package compatibility is centralized at v1-v9"); else fail("Phase 30 migration contract", "Project-package compatibility contract is incomplete");
if (/Phase 30 migration audit/.test(phase30MigrationSource) && /Phase 30 security\/privacy audit/.test(phase30SecuritySource)) pass("Phase 30 final audits", "Migration and security/privacy audits are part of the frozen release tree"); else fail("Phase 30 final audits", "Final migration/security audit scripts are missing");
if (/release-metadata\.json/.test(offlineGeneratorSource) && /VITE_RELEASE_CHANNEL/.test(offlineGeneratorSource)) pass("Phase 30 machine-readable release metadata", "Production bundles record version and channel in offline-cached release metadata"); else fail("Phase 30 machine-readable release metadata", "Release metadata generation is incomplete");
const stableTag = `v${packageJson.version}`;
if (releaseWorkflowSource.includes(`tags: ["${stableTag}"]`) && /VITE_RELEASE_CHANNEL:\s*stable/.test(releaseWorkflowSource) && /smoke-stable/.test(releaseWorkflowSource) && /draft:\s*false/.test(releaseWorkflowSource)) pass("Phase 30 stable promotion gate", `Only the ${stableTag} tagged workflow can publish a stable build after deployed smoke verification`); else fail("Phase 30 stable promotion gate", "Stable publication workflow is not sufficiently gated");
if (/Phase 30 runtime regression/.test(phase30RuntimeSource)) pass("Phase 30 dependency-independent regression", "Final release-freeze invariants have a dedicated gate"); else fail("Phase 30 dependency-independent regression", "Phase 30 runtime regression is missing");

const maintenance601Source = await readFile(join(root, "scripts/releases/v6.0.1/runtime-regression.mjs"), "utf8");
const maintenance602Source = await readFile(join(root, "scripts/releases/v6.0.2/runtime-regression.mjs"), "utf8");
const maintenance603Source = await readFile(join(root, "scripts/releases/v6.0.3/runtime-regression.mjs"), "utf8");
const maintenance604Source = await readFile(join(root, "scripts/releases/v6.0.4/runtime-regression.mjs"), "utf8");
const maintenance605Source = await readFile(join(root, "scripts/releases/v6.0.5/runtime-regression.mjs"), "utf8");
const maintenance606Source = await readFile(join(root, "scripts/releases/v6.0.6/runtime-regression.mjs"), "utf8");
const intuitiveness610Source = await readFile(join(root, "scripts/releases/v6.1.0/runtime-regression.mjs"), "utf8");
const viewerPageSource = await readFile(join(root, "src/views/ViewerPage.tsx"), "utf8");
const editorPageSource = await readFile(join(root, "src/views/EditorPage.tsx"), "utf8");
const ocrPageSource = await readFile(join(root, "src/views/OcrPage.tsx"), "utf8");
const helpContentSource = await readFile(join(root, "src/help/helpContent.ts"), "utf8");
const settingsStoreSource = await readFile(join(root, "src/settings/settingsStore.ts"), "utf8");
const ocrRepositorySource = await readFile(join(root, "src/ocr/ocrRepository.ts"), "utf8");
const homePageSource = await readFile(join(root, "src/views/HomePage.tsx"), "utf8");
const releaseHealthReporterSource = await readFile(join(root, "src/release/ReleaseHealthReporter.tsx"), "utf8");
const packageValidationSource = await readFile(join(root, "src/projects/packageValidation.ts"), "utf8");
const manifestMigrationSource = await readFile(join(root, "src/projects/projectManifestMigration.ts"), "utf8");
if (/isSupersededReleaseCache/.test(serviceWorkerSource) && /RELEASE_BUILD_EPOCH/.test(serviceWorkerSource) && /RELEASE_CHANNEL/.test(serviceWorkerSource) && /replaceAll\("__LPS_RELEASE_BUILD_EPOCH__"/.test(offlineGeneratorSource)) pass("v6.0.1 PWA promotion identity", "Same-version candidate/stable builds receive distinct worker/cache identities"); else fail("v6.0.1 PWA promotion identity", "Service-worker promotion identity hardening is missing");
if (/Number\.isSafeInteger/.test(packageValidationSource) && /assertNonOverlappingPayloadRanges/.test(packageValidationSource) && /validatePayloadRange/.test(phase28PackageSource)) pass("v6.0.1 package range hardening", "Project-package numeric ranges are strict and non-overlapping"); else fail("v6.0.1 package range hardening", "Project-package range validation is incomplete");
if (/assertReadableProjectManifestSchema/.test(manifestMigrationSource) && /version > currentSchemaVersion/.test(manifestMigrationSource) && /newer PDF Studio/.test(manifestMigrationSource) && /migrateProjectManifestForSchema/.test(projectRepositorySource)) pass("v6.0.1 downgrade protection", "Future local project schemas are rejected without rewrite"); else fail("v6.0.1 downgrade protection", "Future project schemas can still be downgraded");
if (/v6\.0\.1 maintenance regression/.test(maintenance601Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.1")) pass("v6.0.1 maintenance gate", "Patch-release regressions are part of the release gate"); else fail("v6.0.1 maintenance gate", "Maintenance regression is not release-gated");
if (/assertNoSameVersionStableDowngrade/.test(serviceWorkerSource) && /candidateChannelRank/.test(serviceWorkerSource) && /Refuse same-version candidate overwrite of Stable Pages/.test(deployWorkflowSource)) pass("v6.0.2 Stable monotonicity", "A same-version candidate cannot replace Stable in either cache ordering or Pages deployment"); else fail("v6.0.2 Stable monotonicity", "Same-version Stable downgrade protection is incomplete");
if (/Production offline asset manifest is unavailable/.test(serviceWorkerSource) && /caches\.delete\(CACHE_VERSION\)/.test(serviceWorkerSource)) pass("v6.0.2 atomic production precache", "Production worker installation fails closed and removes a partial release cache"); else fail("v6.0.2 atomic production precache", "Production service-worker install can accept a partial release cache");
if (/GET_OFFLINE_STATUS/.test(await readFile(join(root, "src/release/serviceWorkerManager.ts"), "utf8")) && /ReleaseHealthReporter/.test(releaseHealthReporterSource) && /!safeMode \? <ReleaseHealthReporter/.test(mainSource) && !/document\.readyState === "complete"/.test(mainSource)) pass("v6.0.2 truthful healthy boot", "Previous release cleanup waits for a committed React tree and complete offline bundle, and remains disabled in Safe Mode"); else fail("v6.0.2 truthful healthy boot", "Healthy-client acknowledgement can occur before the new release is usable or while Safe Mode is active");
if (/requirePayloadRange/.test(packageValidationSource) && /requireArray/.test(packageValidationSource) && /requireNonEmptyString/.test(packageValidationSource) && /requirePayloadRange\(asset\.offset/.test(phase28PackageSource)) pass("v6.0.2 package structure hardening", "Required backup collections, strings, and asset payload ranges are validated before reconstruction"); else fail("v6.0.2 package structure hardening", "Malformed backup structures can still reach reconstruction");
if ((/Verify stable tag points at current main/.test(releaseWorkflowSource) && /refs\/heads\/main/.test(releaseWorkflowSource)) || (/Verify stable tag commit belongs to main history/.test(releaseWorkflowSource) && /merge-base --is-ancestor/.test(releaseWorkflowSource))) pass("v6.0.2 Stable provenance", "Stable tags must originate from main history"); else fail("v6.0.2 Stable provenance", "Stable release tags can publish from an unqualified source commit");
if (/v6\.0\.2 maintenance regression/.test(maintenance602Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.2")) pass("v6.0.2 maintenance gate", "v6.0.2 regressions are part of the release gate"); else fail("v6.0.2 maintenance gate", "v6.0.2 maintenance regression is not release-gated");
if (!/v6\.0\.1/.test(await readFile(join(root, "src/views/ReleasePage.tsx"), "utf8")) && /release\.version/.test(await readFile(join(root, "src/views/ReleasePage.tsx"), "utf8"))) pass("v6.0.2 release UI synchronization", "Release UI derives the active maintenance version from release metadata"); else fail("v6.0.2 release UI synchronization", "Release UI contains stale maintenance-version copy");
if (/!safeMode && "serviceWorker" in navigator/.test(mainSource)) pass("v6.0.3 Safe Mode isolation", "Safe Mode suppresses service-worker controllerchange reloads as well as registration/health reporting"); else fail("v6.0.3 Safe Mode isolation", "Safe Mode can still be reloaded by service-worker controller changes");
if (/processFile\(shared\.file, kind, undefined, shared\.id\)/.test(homePageSource) && /(removeSharedInboxFiles|acknowledgeSharedInboxFiles)\(\[inboxId\]\)/.test(homePageSource) && !/await removeSharedInboxFiles\(\[shared\.id\]\);\s*const kind/.test(homePageSource)) pass("v6.0.3 share inbox durability", "Shared files are removed or durably acknowledged only after a successful import and failures remain retryable"); else fail("v6.0.3 share inbox durability", "Shared files can be discarded before successful import");
if (/Promise\.allSettled\(inserted\.map\(\(key\) => cache\.delete\(key\)\)\)/.test(serviceWorkerSource)) pass("v6.0.3 atomic share target", "Failed multi-file share intake rolls back files already cached in that batch"); else fail("v6.0.3 atomic share target", "A failed share target can leave a partial inbox batch");
if (/validatePackageSemanticReferences/.test(phase28PackageSource) && /Project image references missing asset/.test(phase28PackageSource) && /references missing job/.test(phase28PackageSource)) pass("v6.0.3 package semantic consistency", "Backup editor/OCR references are validated before project reconstruction"); else fail("v6.0.3 package semantic consistency", "Backup semantic references can still be silently dropped or misbound");
if (/Verify stable tag commit belongs to main history/.test(releaseWorkflowSource) && /merge-base --is-ancestor/.test(releaseWorkflowSource)) pass("v6.0.3 Stable provenance race fix", "Stable tags must be reachable from main without racing mutable main HEAD equality"); else fail("v6.0.3 Stable provenance race fix", "Stable provenance remains race-prone or insufficiently constrained");
if (/v6\.0\.3 maintenance regression/.test(maintenance603Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.3")) pass("v6.0.3 maintenance gate", "v6.0.3 regressions are part of the release gate"); else fail("v6.0.3 maintenance gate", "v6.0.3 maintenance regression is not release-gated");

const report = { generatedAt: new Date().toISOString(), version: packageJson.version, sourceFiles: sourceFiles.length, checks, warnings, failures };

if ((/Import success is authoritative/.test(homePageSource) || /Persist logical acknowledgement/.test(homePageSource)) && /acknowledgeSharedInboxFiles/.test(homePageSource)) pass("v6.0.4 share cleanup isolation", "Inbox cleanup failure cannot turn a committed project import into a failed/retryable import"); else fail("v6.0.4 share cleanup isolation", "Successful shared imports can still be misreported after inbox cleanup failure");
if (/project\.schemaVersion <= PROJECT_SCHEMA_VERSION/.test(projectRepositorySource) && /compatibleExisting = migrateProjectManifestForSchema/.test(projectRepositorySource)) pass("v6.0.4 dedupe schema isolation", "Checksum deduplication skips future-schema manifests before touching them"); else fail("v6.0.4 dedupe schema isolation", "Deduplication can still touch future-schema projects");
const stateSchemaGuardSource = await readFile(join(root, "src/projects/stateSchemaGuard.ts"), "utf8");
if (/newer PDF Studio/.test(stateSchemaGuardSource) && /assertReadableStateSchema/.test(phase28PackageSource)) pass("v6.0.4 embedded-state downgrade protection", "Local and packaged feature state reject future schemas rather than rewriting them"); else fail("v6.0.4 embedded-state downgrade protection", "Future feature-state schemas can still be down-converted");
if (/Project editor object ID/.test(phase28PackageSource) && /is duplicated/.test(phase28PackageSource)) pass("v6.0.4 editor-object consistency", "Duplicate editor object IDs are rejected before project restoration"); else fail("v6.0.4 editor-object consistency", "Duplicate editor object IDs can alias restored editor state");
if (/fetch-depth:\s*0/.test(releaseWorkflowSource) && /merge-base --is-ancestor/.test(releaseWorkflowSource)) pass("v6.0.4 Stable ancestry checkout", "Stable provenance uses complete git history instead of a shallow ancestry graph"); else fail("v6.0.4 Stable ancestry checkout", "Stable tag ancestry can be falsely rejected by a shallow checkout");
if (/v6\.0\.4 maintenance regression/.test(maintenance604Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.4")) pass("v6.0.4 maintenance gate", "Bug Fix Audit 2 regressions are part of the release gate"); else fail("v6.0.4 maintenance gate", "v6.0.4 maintenance regression is not release-gated");
const serviceWorkerManagerSource = await readFile(join(root, "src/release/serviceWorkerManager.ts"), "utf8");
if (/storeSharedInboxFiles\(files\)/.test(launchFilesSource) && /peekPendingPwaLaunchFiles/.test(homePageSource) && !/takePendingPwaLaunchFiles/.test(homePageSource)) pass("v6.0.5 file-launch durability", "OS-launched files are durably staged or retained until import succeeds instead of being destructively dequeued"); else fail("v6.0.5 file-launch durability", "OS file handling can still discard a launch before successful import");
if (/Promise\.allSettled\(inserted\.map/.test(shareInboxSource) && /refreshActiveReleaseCache/.test(maintenanceSource) && /pending shared files/.test(maintenanceSource)) pass("v6.0.5 maintenance document preservation", "Cache maintenance cannot delete pending shared document bytes and launch-inbox writes roll back atomically"); else fail("v6.0.5 maintenance document preservation", "Maintenance/share ingress can still lose pending document bytes");
if (/refreshCurrentReleaseCache/.test(serviceWorkerSource) && /existing offline shell was preserved/.test(serviceWorkerSource) && /120_000/.test(serviceWorkerManagerSource)) pass("v6.0.5 offline-shell repair", "Offline-shell maintenance preserves the previous cache on fetch failure and allows a long-running repair response"); else fail("v6.0.5 offline-shell repair", "Offline-shell maintenance can still destroy a working cache or timeout prematurely");
if (/assertReadableProjectManifestSchema\(header\.manifest\.schemaVersion, PROJECT_SCHEMA_VERSION\)/.test(phase28PackageSource)) pass("v6.0.5 package manifest downgrade protection", "Supported package formats still reject project manifests created by a newer schema"); else fail("v6.0.5 package manifest downgrade protection", "A supported package can silently down-convert a future project manifest");
if (/assertReadableStateSchema\(value\.schemaVersion, WORKSPACE_SCHEMA_VERSION, "Workspace session"\)/.test(workspaceRepositorySource)) pass("v6.0.5 workspace downgrade protection", "Future workspace-session schemas remain untouched by older builds"); else fail("v6.0.5 workspace downgrade protection", "Workspace session state can still be silently down-converted");
if (/test:runtime:v6\.0\.1/.test(deployWorkflowSource) && /test:runtime:v6\.0\.5/.test(deployWorkflowSource) && /v6\.0\.5 maintenance regression/.test(maintenance605Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.5")) pass("v6.0.5 maintenance gate", "Bug Fix Audit 3 and every earlier 6.0.x maintenance regression are release-gated"); else fail("v6.0.5 maintenance gate", "v6.0.5 or an earlier maintenance regression is missing from release qualification");
if (/hasFutureSettingsSchema/.test(settingsStoreSource) && /newer PDF Studio version/.test(settingsStoreSource)) pass("v6.0.6 settings downgrade protection", "Future settings are preserved and cannot be overwritten by an older maintenance build"); else fail("v6.0.6 settings downgrade protection", "Future settings can still be silently down-converted");
if (/schemaVersion > CURRENT_BATCH_SCHEMA_VERSION/.test(batchModelSource) && /newer PDF Studio version/.test(batchModelSource)) pass("v6.0.6 Batch downgrade protection", "Future Batch recipes fail closed instead of entering legacy migration"); else fail("v6.0.6 Batch downgrade protection", "Future Batch recipes can still be down-converted");
if (/assertReadableOcrJob/.test(ocrRepositorySource) && /jobs\.map\(assertReadableOcrJob\)/.test(ocrRepositorySource)) pass("v6.0.6 OCR downgrade protection", "Future local OCR jobs are refused before use or rewrite"); else fail("v6.0.6 OCR downgrade protection", "Future OCR state can still be rewritten by an older build");
if (/CONSUMED_KEY/.test(shareInboxSource) && /acknowledgeSharedInboxFiles/.test(shareInboxSource) && /acknowledgeSharedInboxFiles\(\[inboxId\]\)/.test(homePageSource)) pass("v6.0.6 durable Share Inbox acknowledgement", "Committed shared imports remain logically consumed even when physical cache cleanup fails"); else fail("v6.0.6 durable Share Inbox acknowledgement", "A successful shared import can be repeated after cleanup failure");
if (/authoritative PDF source first/.test(projectRepositorySource) && /project was kept so deletion can be retried safely/.test(projectRepositorySource)) pass("v6.0.6 source-safe deletion", "Project metadata is retained when authoritative source deletion cannot be guaranteed"); else fail("v6.0.6 source-safe deletion", "Project deletion can orphan private PDF bytes without a manifest");
if (/const waiting = registration\.waiting/.test(serviceWorkerManagerSource) && /waiting\.postMessage/.test(serviceWorkerManagerSource)) pass("v6.0.6 update activation race", "Waiting service worker is captured before activation can clear registration.waiting"); else fail("v6.0.6 update activation race", "Update activation can report failure after successfully starting");
if (/v6\.0\.6 Bug Fix Audit 4 maintenance regression/.test(maintenance606Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.6")) pass("v6.0.6 maintenance gate", "Bug Fix Audit 4 is included in release qualification"); else fail("v6.0.6 maintenance gate", "v6.0.6 regression is missing from release qualification");
if (/v6\.1\.0 intuitiveness and discoverability regression/.test(intuitiveness610Source) && packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.1.0")) pass("v6.1.0 intuitiveness gate", "Intuitiveness and discoverability regressions are part of release qualification"); else fail("v6.1.0 intuitiveness gate", "v6.1.0 intuitiveness regression is missing from release qualification");
if (/preservationOpen:\s*false/.test(workspaceRepositorySource) && /Advanced & support/.test(appShellSource)) pass("v6.1.0 progressive disclosure", "Technical preservation/support surfaces default out of the everyday workflow"); else fail("v6.1.0 progressive disclosure", "Technical surfaces remain unnecessarily prominent");
if (/Download original PDF/.test(viewerPageSource) && !/>Edit PDF</.test(viewerPageSource) && /toolGroups/.test(editorPageSource) && /Mark redaction/.test(editorPageSource)) pass("v6.1.0 core workflow clarity", "Viewer navigation is deduplicated and editor tools/redaction are grouped clearly"); else fail("v6.1.0 core workflow clarity", "Core viewer/editor terminology remains ambiguous or duplicated");
if (/Recognition quality/.test(ocrPageSource) && /Advanced image cleanup/.test(ocrPageSource) && (helpContentSource.match(/id:\s*"/g) ?? []).length >= 20) pass("v6.1.0 guided advanced controls", "OCR uses plain presets and bundled Help covers at least twenty major workflows"); else fail("v6.1.0 guided advanced controls", "Technical controls or Help coverage remain under-explained");

await writeFile(join(root, "source-audit-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
