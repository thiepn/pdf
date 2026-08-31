import assert from "node:assert/strict";
import test from "node:test";

import { R9_BASELINE_SHA, R9_BUILD_CHANNEL } from "./r9_validate_evidence.mjs";
import { buildDeviceRun } from "./r9_prepare_device_run.mjs";

const template = {
  schema: 1,
  baseline_commit: R9_BASELINE_SHA,
  run_id: "placeholder",
  tester_id: "placeholder",
  environment: {},
  corpus_id: "p43-real-device-v1",
  journey_results: Array.from({ length: 10 }, (_, index) => ({
    id: `J${String(index + 1).padStart(2, "0")}`,
    journey: `Journey ${index + 1}`,
    result: "NOT_RUN"
  })),
  defects: []
};

function options(extra = []) {
  return new Map([
    ["run-id", "device-20260831-windows-01"],
    ["tester-id", "tester-01"],
    ["device-class", "laptop"],
    ["device-model", "Windows laptop"],
    ["os-family", "windows"],
    ["os-version", "Windows 11 24H2"],
    ["browser-family", "chromium"],
    ["browser-name", "Microsoft Edge"],
    ["browser-version", "152.0.0"],
    ["input-mode", "keyboard-trackpad"],
    ["viewport", "1440x900"],
    ["app-mode", "browser"],
    ["attest-physical-device", "yes"],
    ["date", "2026-08-31"],
    ...extra
  ]);
}

test("buildDeviceRun fills only attested device metadata and leaves human journey outcomes unmeasured", () => {
  const run = buildDeviceRun(template, options());
  assert.equal(run.run_id, "device-20260831-windows-01");
  assert.equal(run.tester_id, "tester-01");
  assert.equal(run.environment.physical_device, true);
  assert.equal(run.environment.human_attestation, true);
  assert.equal(run.environment.automation_used_for_observation, false);
  assert.equal(run.environment.build_channel, R9_BUILD_CHANNEL);
  assert.equal(run.journey_results.length, 10);
  assert.ok(run.journey_results.every((entry) => entry.result === "NOT_RUN"));
  assert.deepEqual(run.defects, []);
});

test("device-run generator requires explicit physical-device attestation", () => {
  const missing = options();
  missing.delete("attest-physical-device");
  assert.throws(() => buildDeviceRun(template, missing), /Required option --attest-physical-device is missing/);

  const denied = options([["attest-physical-device", "no"]]);
  assert.throws(() => buildDeviceRun(template, denied), /must equal yes/);
});

test("device-run generator requires run and tester identity", () => {
  assert.throws(() => buildDeviceRun(template, new Map()), /Required option --run-id is missing/);
});
