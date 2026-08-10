import assert from "node:assert/strict";
import { classifyTextEditability, detectScript, formCapability, wrapTextToBox } from "../../src/native/nativeModel.ts";
import { discardNativeObjectEdits, mergeNativeEdits, nativeChangedPages } from "../../src/native/nativeEditQueue.ts";

const korean = classifyTextEditability("한국어 문서", "NotoSansCJK");
assert.equal(detectScript("한국어 문서"), "cjk-ko");
assert.equal(korean.editability, "cjk-fixed-box");
assert.equal(korean.capability.level, "safe-reconstruction");
assert.ok(wrapTextToBox("한국어문장을공백없이줄바꿈", 30, 10).length > 1, "CJK no-space wrapping must chunk safely.");

const arabic = classifyTextEditability("مرحبا بالعالم", "Arial");
assert.equal(arabic.editability, "overlay-only");
assert.equal(arabic.capability.level, "appearance-only");

assert.equal(formCapability("text", false, false).level, "native-safe");
assert.equal(formCapability("signature", false, true).level, "unsupported");

const cell = (id, objectId, cellId, pageNumber) => ({ id, kind: "table-cell", objectId, cellId, pageNumber, bounds: { x: 0, y: 0, w: 10, h: 10 }, originalText: "old", text: id, fontSize: 10 });
const current = [cell("a", "table-1", "c1", 2), cell("b", "table-1", "c2", 2), cell("other", "table-2", "c1", 4)];
const merged = mergeNativeEdits(current, [cell("replacement", "table-1", "c3", 2)]);
assert.deepEqual(merged.map((edit) => edit.id), ["other", "replacement"], "Table edits must replace the prior object batch without touching unrelated edits.");
assert.deepEqual(nativeChangedPages(merged), [2, 4]);
assert.deepEqual(discardNativeObjectEdits(merged, "table-1").map((edit) => edit.id), ["other"]);

console.log(JSON.stringify({ passed: true, checks: 10 }, null, 2));
