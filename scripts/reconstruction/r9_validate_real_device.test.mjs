import assert from "node:assert/strict";
import test from "node:test";

import { R9_BASELINE_SHA, R9_BUILD_CHANNEL } from "./r9_validate_evidence.mjs";
import { JOURNEY_IDS, summarizeRealDeviceRuns, validateRealDeviceRun } from "./r9_validate_real_device.mjs";

function environment(overrides = {}) {
  return {
    date: "2026-08-31",
    evidence_source: "human-physical-device",
    physical_device: true,
    simulator_or_emulator: false,
    automation_used_for_observation: false,
    human_attestation: true,
    device_class: "laptop",
    device_model: "Windows laptop",
    os_family: "windows",
    os_version: "Windows 11 24H2",
    browser_family: "chromium",
    browser_name: "Microsoft Edge",
    browser_version: "152.0.0",
    input_mode: "keyboard-trackpad",
    viewport: "1440x900",
    app_mode: "browser",
    build_channel: R9_BUILD_CHANNEL,
    ...overrides
  };
}

function run(id, env, overrides = {}) {
  return {
    schema: 1,
    baseline_commit: R9_BASELINE_SHA,
    run_id: id,
    tester_id: overrides.tester_id || `tester-${id}`,
    environment: env,
    corpus_id: "p43-real-device-v1",
    journey_results: JOURNEY_IDS.map((journeyId) => ({ id: journeyId, result: overrides.result || "PASS" })),
    defects: overrides.defects || []
  };
}

function completeMatrix() {
  return [
    run("windows", environment()),
    run("macos", environment({
      device_model: "MacBook",
      os_family: "macos",
      os_version: "macOS 27.0",
      browser_family: "safari-webkit",
      browser_name: "Safari",
      browser_version: "27.0"
    })),
    run("android", environment({
      device_class: "phone",
      device_model: "Android phone",
      os_family: "android",
      os_version: "Android 17",
      browser_name: "Chrome",
      browser_version: "152.0.0",
      input_mode: "touch",
      viewport: "412x915",
      app_mode: "installed-pwa"
    })),
    run("ios", environment({
      device_class: "phone",
      device_model: "iPhone",
      os_family: "ios",
      os_version: "iOS 27.0",
      browser_family: "safari-webkit",
      browser_name: "Safari",
      browser_version: "27.0",
      input_mode: "touch",
      viewport: "390x844"
    })),
    run("ipados", environment({
      device_class: "tablet",
      device_model: "iPad",
      os_family: "ipados",
      os_version: "iPadOS 27.0",
      browser_family: "safari-webkit",
      browser_name: "Safari",
      browser_version: "27.0",
      input_mode: "touch",
      viewport: "1024x1366"
    }))
  ];
}

test("no real-device evidence remains unmeasured", () => {
  const summary = summarizeRealDeviceRuns([]);
  assert.equal(summary.status, "REAL_DEVICE_UNMEASURED");
  assert.equal(summary.runs, 0);
  assert.equal(summary.matrix.sufficient, false);
});

test("one valid physical run remains matrix-incomplete", () => {
  const summary = summarizeRealDeviceRuns([run("windows", environment())]);
  assert.equal(summary.status, "REAL_DEVICE_MATRIX_INCOMPLETE");
  assert.equal(summary.matrix.covered_slots, 1);
});

test("five required physical-device slots plus journeys and installed PWA meet target", () => {
  const summary = summarizeRealDeviceRuns(completeMatrix());
  assert.equal(summary.status, "REAL_DEVICE_TARGET_MET");
  assert.equal(summary.matrix.covered_slots, 5);
  assert.equal(summary.matrix.sufficient, true);
  assert.equal(summary.journeys.covered, 10);
  assert.equal(summary.installed_pwa_covered, true);
});

test("simulator and automation evidence cannot qualify", () => {
  const simulated = run("sim", environment({ simulator_or_emulator: true }));
  assert.throws(() => validateRealDeviceRun(simulated), /simulator_or_emulator must be false/);

  const automated = run("auto", environment({ automation_used_for_observation: true }));
  assert.throws(() => validateRealDeviceRun(automated), /automation_used_for_observation must be false/);

  const marker = run("marker", environment({ device_model: "Playwright device" }));
  assert.throws(() => validateRealDeviceRun(marker), /automation, or CI markers/);
});

test("exact browser and OS versions are required", () => {
  const value = run("noversion", environment({ browser_version: "latest" }));
  assert.throws(() => validateRealDeviceRun(value), /browser_version must include an exact version number/);
});

test("any measured journey failure prevents real-device target", () => {
  const runs = completeMatrix();
  runs[0].journey_results[0].result = "FAIL";
  const summary = summarizeRealDeviceRuns(runs);
  assert.equal(summary.status, "REAL_DEVICE_TARGET_MISSED");
  assert.equal(summary.measured_failures.length, 1);
});

test("installed PWA recovery coverage is required", () => {
  const runs = completeMatrix();
  for (const value of runs) value.environment.app_mode = "browser";
  const summary = summarizeRealDeviceRuns(runs);
  assert.equal(summary.status, "REAL_DEVICE_MATRIX_INCOMPLETE");
  assert.equal(summary.installed_pwa_covered, false);
});
