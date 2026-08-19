import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyIncomingFile } from "../../src/pwa/fileIngress.ts";

let passed = 0;
function check(name, task) {
  task(); passed += 1; console.log(`PASS ${name}`);
}

const manifest = JSON.parse(await readFile(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
const sw = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const generator = await readFile(new URL("../generate-offline-assets.mjs", import.meta.url), "utf8");
const home = await readFile(new URL("../../src/views/HomePage.tsx", import.meta.url), "utf8");
const readiness = await readFile(new URL("../../src/components/PwaReadinessCard.tsx", import.meta.url), "utf8");

check("PDF ingress classification", () => {
  assert.equal(classifyIncomingFile("paper.PDF"), "pdf");
  assert.equal(classifyIncomingFile("untitled", "application/pdf"), "pdf");
});
check("Project ingress classification", () => assert.equal(classifyIncomingFile("backup.lpsproject"), "package"));
check("Unsupported ingress rejection", () => assert.equal(classifyIncomingFile("photo.jpg", "image/jpeg"), null));
check("Web Share Target manifest", () => {
  assert.equal(manifest.share_target?.method, "POST");
  assert.equal(manifest.share_target?.enctype, "multipart/form-data");
  assert.equal(manifest.share_target?.params?.files?.[0]?.name, "files");
});
check("PWA file handler manifest", () => assert.ok(manifest.file_handlers?.[0]?.accept?.["application/pdf"]?.includes(".pdf")));
check("PWA launch policy", () => assert.ok(manifest.launch_handler?.client_mode?.includes("navigate-existing")));
check("Consumer-core precache with on-demand feature cache", () => {
  assert.match(sw, /offline-assets\.json/);
  assert.match(sw, /precacheRelease/);
  assert.match(generator, /schemaVersion:\s*2/);
  assert.match(generator, /consumer-core-plus-runtime-features/);
  assert.match(generator, /coreAssets/);
  assert.match(generator, /optionalAssets/);
  assert.match(generator, /!name\.endsWith\("\.map"\)/);
});
check("Atomic update cache retention", () => {
  assert.match(sw, /CLIENT_HEALTHY/);
  assert.match(sw, /isSupersededReleaseCache/);
  assert.doesNotMatch(sw, /activate[\s\S]{0,250}RELEASE_CACHE_PREFIX[\s\S]{0,250}caches\.delete/);
});
check("Local share inbox interception", () => {
  assert.match(sw, /SHARE_TARGET_PATH/);
  assert.match(sw, /SHARE_INBOX_CACHE/);
  assert.match(sw, /request\.formData\(\)/);
});
check("Home consumes PWA ingress", () => {
  assert.match(home, /listSharedInboxFiles/);
  assert.match(home, /peekPendingPwaLaunchFiles|listSharedInboxFiles/);
  assert.match(home, /classifyIncomingFile/);
});
check("Install and persistence readiness UX", () => {
  assert.match(readiness, /Install app/);
  assert.match(readiness, /Prevent browser cleanup/);
  assert.match(readiness, /offlineAssetsCached/);
});
check("Phase 24 build produces offline manifest", () => assert.match(pkg.scripts?.build ?? "", /generate-offline-assets\.mjs/));

console.log(`Phase 24 runtime regression: ${passed}/12 passed.`);
