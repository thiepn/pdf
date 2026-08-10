import assert from "node:assert/strict";
import { assessStorageBudget } from "../../src/storage/budget.ts";
import {
  cancelProjectOperation,
  getProjectOperation,
  runProjectOperation,
  subscribeProjectOperation
} from "../../src/operations/projectOperationCoordinator.ts";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const healthy = assessStorageBudget({ usage: 100_000_000, quota: 1_000_000_000 }, 50_000_000);
check(healthy.status === "ok", "Healthy storage should pass.");
check(healthy.requiredBytes === 54_000_001 || healthy.requiredBytes === 54_000_000, "Write overhead should be included.");
check((healthy.availableBytes ?? 0) === 900_000_000, "Available storage should be derived from usage and quota.");
check((healthy.reserveBytes ?? 0) === 50_000_000, "Five-percent reserve should apply for a 1 GB quota.");

const warning = assessStorageBudget({ usage: 930_000_000, quota: 1_000_000_000 }, 30_000_000);
check(warning.status === "warning", "Writes that violate the reserve should warn/block at assertion time.");
const blocked = assessStorageBudget({ usage: 980_000_000, quota: 1_000_000_000 }, 30_000_000);
check(blocked.status === "blocked", "Writes larger than remaining quota should be blocked.");
const unknown = assessStorageBudget(undefined, 10_000_000);
check(unknown.supported === false && unknown.status === "warning", "Missing quota APIs should degrade to an explicit warning state.");

const events = [];
const unsubscribe = subscribeProjectOperation("project-a", operation => events.push(operation?.stage ?? "idle"));
let releaseFirst;
const first = runProjectOperation("project-a", { label: "First operation" }, async ({ update }) => {
  update({ detail: "working", progress: 0.4 });
  await new Promise(resolve => { releaseFirst = resolve; });
  return "done";
});
await new Promise(resolve => setTimeout(resolve, 0));
check(getProjectOperation("project-a")?.label === "First operation", "Active operation should be discoverable.");
await assert.rejects(() => runProjectOperation("project-a", { label: "Second operation" }, async () => "no"), /already running/i);
checks += 1;
const other = await runProjectOperation("project-b", { label: "Other project" }, async () => "other");
check(other === "other", "Different projects may run independently.");
releaseFirst();
check(await first === "done", "The original operation should complete.");
check(getProjectOperation("project-a") === null, "Completed operations should be removed from the registry.");
unsubscribe();
check(events.includes("queued") && events.includes("running") && events.at(-1) === "idle", "Subscribers should observe queued, running, and idle states.");

let sawAbort = false;
const cancelled = runProjectOperation("project-c", { label: "Cancellable" }, async ({ signal }) => {
  await new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { sawAbort = true; reject(signal.reason); }, { once: true });
  });
});
await new Promise(resolve => setTimeout(resolve, 0));
check(cancelProjectOperation("project-c") === true, "Cancellable operations should accept global cancellation.");
await assert.rejects(cancelled, /cancel/i);
checks += 1;
check(sawAbort, "Cancellation should propagate to the task signal.");
check(getProjectOperation("project-c") === null, "Cancelled operations should clear registry state.");

let releaseProtected;
const protectedOperation = runProjectOperation("project-d", { label: "Protected commit", cancellable: false }, async () => {
  await new Promise(resolve => { releaseProtected = resolve; });
});
await new Promise(resolve => setTimeout(resolve, 0));
check(cancelProjectOperation("project-d") === false, "Non-cancellable commit stages must reject global cancellation.");
releaseProtected();
await protectedOperation;
check(getProjectOperation("project-d") === null, "Protected operations should clear after completion.");

console.log(JSON.stringify({ passed: true, checks }, null, 2));
