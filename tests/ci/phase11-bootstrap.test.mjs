import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const start = workflow.indexOf("\n  phase11-stability-gate:");
const end = workflow.indexOf("\n  validate:", start);
assert.ok(start >= 0 && end > start, "Phase 11 and validation jobs must exist");
const phase11 = workflow.slice(start, end);

test("Phase 11 must install exact locked dependencies before its mandatory gate", () => {
  const lock = phase11.indexOf("run: test -f package-lock.json");
  const install = phase11.indexOf("run: npm ci --no-audit --no-fund");
  const gate = phase11.indexOf("run: npm run gate:phase11");
  assert.ok(lock >= 0 && lock < install && install < gate, "Lock, npm ci and gate must run in that order");
  assert.doesNotMatch(phase11, /continue-on-error:\s*true/, "Do not turn qualification failures into success");
});

test("Phase 11 semantic typecheck remains required rather than bypassed", () => {
  const gate = readFileSync("scripts/phase11/gate.mjs", "utf8");
  const typecheck = readFileSync("scripts/phase11/offline-typecheck.mjs", "utf8");
  assert.match(gate, /scripts\/phase11\/offline-typecheck\.mjs/, "Compiler test must remain in gate sequence");
  assert.match(typecheck, /spawnSync\(executable, args/, "TypeScript must actually be executed");
  assert.match(typecheck, /if \(result\.status !== 0\) process\.exit/, "Compiler failure must remain fatal");
});
