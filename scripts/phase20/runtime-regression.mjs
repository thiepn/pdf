import assert from "node:assert/strict";
import { deriveViewerPerformancePolicy } from "../../src/viewer/performancePolicy.ts";
import { RenderScheduler } from "../../src/viewer/renderScheduler.ts";

const baseSettings = {
  schemaVersion: 5,
  theme: "system",
  density: "comfortable",
  experienceMode: "simple",
  motion: "system",
  defaultViewMode: "continuous",
  defaultZoom: 1,
  reopenLastProject: false,
  retainSearchIndex: false,
  renderingQuality: "adaptive",
  updateMode: "prompt",
  confirmDestructive: true,
  diagnosticLogging: true,
  recordActivity: true,
  showPreservationWarnings: true
};

const large = deriveViewerPerformancePolicy(baseSettings, 500, 180_000_000, { deviceMemoryGb: 16, logicalProcessors: 12, viewportPixels: 2_000_000 });
assert.equal(large.largeDocument, true);
assert.equal(large.effectiveProfile, "low-memory");
assert.ok(large.renderConcurrency <= 2);
assert.ok(large.pixelRatioCap <= 1.5);

const capable = deriveViewerPerformancePolicy(baseSettings, 20, 5_000_000, { deviceMemoryGb: 16, logicalProcessors: 12, viewportPixels: 2_000_000 });
assert.equal(capable.largeDocument, false);
assert.equal(capable.effectiveProfile, "high");
assert.equal(capable.renderConcurrency, 4);

const constrained = deriveViewerPerformancePolicy(baseSettings, 20, 5_000_000, { deviceMemoryGb: 4, logicalProcessors: 8, viewportPixels: 2_000_000 });
assert.equal(constrained.effectiveProfile, "low-memory");
assert.match(constrained.reasons.join(" "), /memory/i);

const forcedHigh = deriveViewerPerformancePolicy({ ...baseSettings, renderingQuality: "high" }, 600, 200_000_000, { deviceMemoryGb: 16, logicalProcessors: 16, viewportPixels: 2_000_000 });
assert.equal(forcedHigh.effectiveProfile, "high");
assert.equal(forcedHigh.largeDocument, true);
assert.ok(forcedHigh.pixelRatioCap <= 1.5, "Large-document guard must cap even a forced high-quality profile.");

const scheduler = new RenderScheduler(2);
let active = 0;
let maxActive = 0;
const makeJob = (value, delay = 8) => scheduler.run(async () => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolve) => setTimeout(resolve, delay));
  active -= 1;
  return value;
});
const values = await Promise.all([makeJob(1), makeJob(2), makeJob(3), makeJob(4)]);
assert.deepEqual(values, [1, 2, 3, 4]);
assert.equal(maxActive, 2);
assert.equal(scheduler.snapshot().completed, 4);
assert.equal(scheduler.snapshot().active, 0);
assert.equal(scheduler.snapshot().queued, 0);

const single = new RenderScheduler(1);
const first = single.run(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return "first"; });
const second = single.run(async () => "second");
const secondRejected = assert.rejects(second, /cancel/i);
single.clear();
assert.equal(await first, "first");
await secondRejected;
assert.equal(single.snapshot().cancelled, 1);


const priorityScheduler = new RenderScheduler(1);
let releaseBlocker;
const order = [];
const blocker = priorityScheduler.run(async () => { await new Promise((resolve) => { releaseBlocker = resolve; }); order.push("blocker"); });
const low = priorityScheduler.run(async () => { order.push("low"); }, undefined, "low");
const high = priorityScheduler.run(async () => { order.push("high"); }, undefined, "high");
releaseBlocker();
await Promise.all([blocker, low, high]);
assert.deepEqual(order, ["blocker", "high", "low"]);
assert.equal(priorityScheduler.snapshot().completed, 3);

console.log(JSON.stringify({ passed: true, checks: 20 }, null, 2));
