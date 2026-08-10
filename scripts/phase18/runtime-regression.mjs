import assert from "node:assert/strict";
import { batchStepLabel, defaultBatchStep, migrateBatchRecipe, normalizeBatchBlankPageCount } from "../../src/processing/batchModel.ts";
import { mmToPt, normalizePagesPerSplit, resolveDecorationLanguage } from "../../src/toolbox/toolboxModel.ts";
import { createStoredZip } from "../../src/toolbox/zip.ts";

assert.equal(Math.round(mmToPt(25.4) * 1000) / 1000, 72);
assert.equal(mmToPt(-5), 0);
assert.equal(normalizePagesPerSplit(0), 1);
assert.equal(normalizePagesPerSplit(999), 500);
assert.equal(normalizePagesPerSplit(Number.NaN), 1);
assert.equal(normalizeBatchBlankPageCount(0), 1);
assert.equal(normalizeBatchBlankPageCount(99), 20);

assert.equal(resolveDecorationLanguage("한국어 문서"), "ko");
assert.equal(resolveDecorationLanguage("日本語の文書"), "ja");
assert.equal(resolveDecorationLanguage("中文文档"), "zh-Hans");
assert.equal(resolveDecorationLanguage("中文文檔", "zh-Hant"), "zh-Hant");
assert.throws(() => resolveDecorationLanguage("مرحبا بالعالم"), /Complex-script decoration/);

const grayscale = defaultBatchStep("grayscale", "gray-1");
assert.deepEqual(grayscale, { id: "gray-1", type: "grayscale", profile: "balanced" });
assert.equal(batchStepLabel(grayscale), "Grayscale · balanced");

let id = 0;
const migrated = migrateBatchRecipe({
  schemaVersion: 1,
  id: "legacy",
  name: "Legacy cleanup",
  steps: [],
  outputSuffix: "done",
  updatedAt: 1,
  rotate: 90,
  compression: "lossless",
  removeMetadata: true
}, 42, () => `step-${++id}`);
assert.equal(migrated.schemaVersion, 3);
assert.equal(migrated.updatedAt, 42);
assert.deepEqual(migrated.steps.map((step) => step.type), ["rotate", "optimize", "remove-metadata"]);
assert.deepEqual(migrated.steps.map((step) => step.id), ["step-1", "step-2", "step-3"]);

const zip = createStoredZip([
  { name: "a.txt", bytes: new TextEncoder().encode("alpha") },
  { name: "한국어.txt", bytes: new TextEncoder().encode("beta") }
]);
const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
assert.equal(view.getUint32(0, true), 0x04034b50, "ZIP must start with a local-file header.");
assert.equal(view.getUint32(zip.byteLength - 22, true), 0x06054b50, "ZIP must end with an EOCD record.");
assert.equal(view.getUint16(zip.byteLength - 12, true), 2, "ZIP central directory must report both files.");
const decoded = new TextDecoder().decode(zip);
assert.match(decoded, /a\.txt/);
assert.match(decoded, /한국어\.txt/);

console.log(JSON.stringify({ passed: true, checks: 23 }, null, 2));
