import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { assertNonOverlappingPayloadRanges, validatePayloadRange } from "../../../src/projects/packageValidation.ts";
import { migrateProjectManifestForSchema } from "../../../src/projects/projectManifestMigration.ts";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.1 maintenance regression failed: ${name}`);
  passed += 1; checks.push(name);
}

const packageJson = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
const release = await readFile(new URL("../../../src/core/release.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../../../scripts/generate-offline-assets.mjs", import.meta.url), "utf8");
let sw = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");

check(/^6\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "6.0.1+ 6.x compatibility version synchronization");
check(sw.includes("__LPS_RELEASE_CHANNEL__") && sw.includes("__LPS_RELEASE_BUILD_EPOCH__"), "service worker is build-identity templated");
check(/replaceAll\("__LPS_RELEASE_CHANNEL__"/.test(generator) && /replaceAll\("__LPS_RELEASE_BUILD_EPOCH__"/.test(generator), "build stamps service-worker identity");

const sandbox = {
  self: {
    location: { href: "https://example.test/app/sw.js", origin: "https://example.test" },
    registration: { scope: "https://example.test/app/" },
    addEventListener() {}
  },
  caches: { keys: async () => [], open: async () => ({}) },
  URL, Response, Request, FormData, crypto, console
};
sw = sw
  .replaceAll("__LPS_RELEASE_VERSION__", "6.0.1")
  .replaceAll("__LPS_RELEASE_CHANNEL__", "stable")
  .replaceAll("__LPS_RELEASE_BUILD_EPOCH__", "1000");
vm.runInNewContext(sw, sandbox);
const prefix = "local-pdf-studio-app-release-";
check(sandbox.isSupersededReleaseCache(`${prefix}6.0.1-release-candidate-1000`) === true, "same-version candidate cache is superseded by stable build");
check(sandbox.isSupersededReleaseCache(`${prefix}6.0.1-stable-2000`) === false, "active build never deletes a newer same-version cache");
check(sandbox.isSupersededReleaseCache(`${prefix}6.0.0`) === true, "legacy older release cache is cleaned after healthy boot");

check(validatePayloadRange(10, 5, 10, 20, "asset")?.end === 15, "valid package range accepted");
for (const [offset, length] of [["10", 5], [10, "5"], [-1, 5], [10, -5], [Number.NaN, 5], [18, 5], [undefined, 5]]) {
  let rejected = false;
  try { validatePayloadRange(offset, length, 10, 20, "asset"); } catch { rejected = true; }
  check(rejected, `invalid package range rejected (${String(offset)}, ${String(length)})`);
}
let overlapRejected = false;
try { assertNonOverlappingPayloadRanges([{ start: 10, end: 15, label: "a" }, { start: 14, end: 18, label: "b" }]); } catch { overlapRejected = true; }
check(overlapRejected, "overlapping package payload ranges rejected");

const current = { schemaVersion: 3, id: "p", name: "P", sourceFilename: "p.pdf", mimeType: "application/pdf", byteLength: 1, checksum: "x", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb", summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false } };
check(migrateProjectManifestForSchema(current, 3, () => "r") === current, "current project manifest remains unchanged");
let futureRejected = false;
try { migrateProjectManifestForSchema({ ...current, schemaVersion: 4 }, 3, () => "r"); } catch (error) { futureRejected = /newer PDF Studio/.test(String(error)); }
check(futureRejected, "future project schema is rejected without downgrade migration");
const legacy = migrateProjectManifestForSchema({ ...current, schemaVersion: 1 }, 3, () => "legacy-r", 99);
check(legacy.schemaVersion === 3 && legacy.revision?.id === "legacy-r" && legacy.updatedAt === 99, "legacy project schema still migrates forward");

console.log(JSON.stringify({ name: "v6.0.1 maintenance regression", passed, total: passed, checks }, null, 2));
