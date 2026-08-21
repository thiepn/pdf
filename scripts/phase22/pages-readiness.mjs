import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];
const warnings = [];
const passes = [];
const read = (path) => readFile(join(root, path), "utf8");
const check = (ok, name, detail) => { (ok ? passes : failures).push(`${name}: ${detail}`); };

const [vite, deploy, ci, release, sw, manifest, index, maintenance, manager, packageJson, distAudit, offlineGenerator] = await Promise.all([
  read("vite.config.ts"), read(".github/workflows/deploy.yml"), read(".github/workflows/ci.yml"), read(".github/workflows/release.yml"), read("public/sw.js"), read("public/manifest.webmanifest"), read("index.html"), read("src/maintenance/maintenance.ts"), read("src/release/serviceWorkerManager.ts"), read("package.json"), read("scripts/check-dist.mjs"), read("scripts/generate-offline-assets.mjs")
]);

check(/GITHUB_REPOSITORY/.test(vite) && /VITE_BASE_PATH/.test(vite), "Vite Pages base", "Repository subpaths are derived in CI and remain overridable.");
check(/actions\/configure-pages@v6/.test(deploy) && /actions\/upload-pages-artifact@v5/.test(deploy) && /actions\/deploy-pages@v4/.test(deploy), "Pages actions", "Current Pages configure/upload/deploy actions are wired.");
check(/npm ci --no-audit --no-fund/.test(deploy) && !/else npm install/.test(deploy), "Deterministic deploy install", "Deployment uses npm ci without an install fallback.");
check(/PAGES_BASE_PATH/.test(deploy) && /VITE_BASE_PATH:\s*\$\{\{ env\.PAGES_BASE_PATH \}\}/.test(deploy), "Pages build base", "Deployment defaults to /<repository>/ and supports an explicit custom-domain base override.");
check(/release-integrity\.json/.test(deploy) && /manifest\.webmanifest/.test(deploy) && /sw\.js/.test(deploy), "Post-deploy smoke", "Published shell, manifest, worker, and integrity evidence are checked.");
check(/npm ci --no-audit --no-fund/.test(ci) && !/else npm install/.test(ci), "Deterministic CI install", "CI uses npm ci without fallback.");
check(/npm ci --no-audit --no-fund/.test(release), "Deterministic tagged release", "Tagged releases require the committed dependency graph.");
check(/RELEASE_CACHE_PREFIX/.test(sw) && /isSupersededReleaseCache/.test(sw) && /CLIENT_HEALTHY/.test(sw), "Atomic release cache handoff", "Old release caches are retained through activation and pruned only after a healthy client boot, without deleting a newer waiting release.");
check(/url\.pathname\.startsWith\(SCOPE_PATH\)/.test(sw), "Scoped fetch handling", "Worker only handles URLs inside its repository scope.");
check(/refreshActiveReleaseCache/.test(maintenance) && /registration\.scope === expectedScope/.test(maintenance) && /pending shared files/.test(maintenance), "Scoped maintenance", "Maintenance refreshes only this deployment's offline shell, preserves pending shared files, and unregisters only the matching service-worker scope.");
check(/normalizeBasePath\(import\.meta\.env\.BASE_URL\)/.test(manager), "Service-worker registration scope", "Registration scope comes from the Vite base rather than the current document path.");
check(/"id"\s*:\s*"\.\/"/.test(manifest) && /"start_url"\s*:\s*"\.\/#\/home"/.test(manifest) && /"scope"\s*:\s*"\.\/"/.test(manifest), "PWA repository-relative manifest", "Manifest identity/start/scope remain repository-relative.");
check(/"share_target"/.test(manifest) && /"file_handlers"/.test(manifest) && /"launch_handler"/.test(manifest), "Installed PWA ingress", "Share Target, File Handling, and launch-client policy are declared as progressive capabilities.");
check(/icon-192\.png/.test(manifest) && /icon-512\.png/.test(manifest) && /apple-touch-icon\.png/.test(index), "Install icons", "PNG install icons and Apple touch icon are present.");
check(/viewport-fit=cover/.test(index), "Mobile viewport", "Safe-area capable viewport is configured.");
check(/offline-assets\.json/.test(sw) && /precacheRelease/.test(sw) && /GET_OFFLINE_STATUS/.test(sw), "Complete offline release cache", "Worker installs the generated release asset manifest and exposes readiness diagnostics.");
check(/generate-offline-assets\.mjs/.test(packageJson) && /offline-assets\.json/.test(distAudit), "Offline build gate", "Every production build creates and validates a complete offline asset manifest.");
check(/\.map/.test(offlineGenerator) && /!name\.endsWith/.test(offlineGenerator), "Offline cache size control", "Source maps are excluded from offline runtime precaching.");
check(/SHARE_TARGET_PATH/.test(sw) && /request\.formData/.test(sw) && /SHARE_INBOX_CACHE/.test(sw), "Local share-target handling", "Shared PDF/project files are captured by the local service worker instead of requiring a server endpoint.");
check(/hasAnyActiveProjectOperation/.test(manager), "Update operation guard", "Automatic/service-worker update activation defers while a document transformation is active.");
check(/PLAYWRIGHT_SKIP_BUILD:\s*["']?1/.test(deploy) && /Install Playwright browsers/.test(deploy), "Browser-qualified deployment", "Pages upload occurs only after Playwright exercises the already-built distribution.");
check(/actions\/download-artifact@v/.test(ci) && /phase30-verified-dist/.test(ci) && /PLAYWRIGHT_SKIP_BUILD:\s*["']?1/.test(ci), "Verified artifact browser matrix", "CI browser regression downloads and tests the verified distribution artifact instead of rebuilding.");
check(/dist-fingerprint\.mjs/.test(ci) && /Reproducible production build/.test(ci) && /Reproducible deployment build/.test(deploy), "Reproducible build gate", "CI and Pages deployment compare same-commit production distribution fingerprints.");
const currentVersion = JSON.parse(packageJson).version;
check(/^[67]\.\d+\.\d+$/.test(currentVersion), "Current web release version", `Package version ${currentVersion} remains on the qualified v6/v7 release line.`);
check(/release-metadata\.json/.test(offlineGenerator) && /VITE_RELEASE_CHANNEL/.test(offlineGenerator), "Release channel metadata", "Production bundles expose offline-cached machine-readable version/channel evidence.");
check(/__LPS_RELEASE_BUILD_EPOCH__/.test(sw) && /replaceAll\("__LPS_RELEASE_BUILD_EPOCH__"/.test(offlineGenerator) && /RELEASE_BUILD_EPOCH/.test(sw), "Maintenance service-worker build identity", "Same-version release-channel promotions force a distinct worker/cache identity.");
check(release.includes(`tags: ["v${currentVersion}"]`) && /VITE_RELEASE_CHANNEL:\s*stable/.test(release) && /smoke-stable/.test(release), "Stable promotion workflow", `Only the exact v${currentVersion} tag builds the stable channel and smoke-tests it after Pages deployment.`);
check(/assertNoSameVersionStableDowngrade/.test(sw) && /Refuse same-version candidate overwrite of Stable Pages/.test(deploy), "Stable channel monotonicity", "A same-version release-candidate cannot overwrite an already published Stable PWA.");
check(/Production offline asset manifest is unavailable/.test(sw) && /caches\.delete\(CACHE_VERSION\)/.test(sw), "Fail-closed production precache", "A production worker with an incomplete offline manifest fails installation instead of activating partially.");
check(/GET_OFFLINE_STATUS/.test(manager) && /status\?\.ready/.test(manager), "Healthy-release acknowledgement", "Old release cleanup is allowed only after the active worker confirms a complete offline bundle.");
check((/Verify stable tag points at current main/.test(release) && /refs\/heads\/main/.test(release)) || (/Verify stable tag commit belongs to main history/.test(release) && /merge-base --is-ancestor/.test(release)), "Stable source provenance", "The stable tag commit must originate from main history without depending on mutable HEAD equality.");

for (const file of ["public/icons/icon-192.png", "public/icons/icon-512.png", "public/icons/apple-touch-icon.png"]) {
  try { await access(join(root, file)); passes.push(`Install asset: ${file}`); } catch { failures.push(`Install asset: missing ${file}`); }
}
try { await access(join(root, "package-lock.json")); passes.push("Dependency lock: package-lock.json is committed."); }
catch { warnings.push("Dependency lock: package-lock.json is not available in this execution environment; run the Bootstrap dependency lock workflow on GitHub before enabling stable deployment."); }

console.log(`GitHub Pages/PWA readiness: ${passes.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s).`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of warnings) console.warn(`WARN ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);
if (failures.length) process.exitCode = 1;
