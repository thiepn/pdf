import assert from "node:assert/strict";
import test from "node:test";

import { buildCertification } from "./r9_certify_evidence.mjs";
import { R9_BASELINE_SHA, R9_BUILD_CHANNEL, R9_SESSION_SCHEMA } from "./r9_validate_evidence.mjs";
import { JOURNEY_IDS } from "./r9_validate_real_device.mjs";

const D = Array.from({ length: 20 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`);
const ORDER = [...D.slice(5), ...D.slice(0, 5)];
const MAP = ["D01", "D04", "D05", "D06", "D07", "D10", "D14", "D15", "D18", "D19"];

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

function session(n, familiarity) {
  const tester = `tester-${n}`;
  return {
    schema: R9_SESSION_SCHEMA,
    baseline_commit: R9_BASELINE_SHA,
    session_id: `session-20260831-0${n}`,
    tester_id: tester,
    tester_profile: { familiarity, pdf_experience: "regular" },
    environment: environment(),
    corpus_id: "r9-manual-v2",
    measurement_order: [...ORDER],
    first_location: D.map((id, i) => ({ id, intent: `Intent ${i + 1}`, first_location: "Canonical destination", correct_first_location: i < 18, help_used_before_choice: false, meaningful_interactions: 1 })),
    no_help_completion: MAP.map((measured_during, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, workflow: `Workflow ${i + 1}`, measured_during, completed_without_help: i < 9, result: i < 9 ? "PASS" : "FAIL" })),
    navigation_prediction: D.map((id, i) => ({ id, predicted_location: "Canonical destination", matches_canonical: i < 18 })),
    defects: []
  };
}

function deviceRun(id, env, tester = `device-tester-${id}`) {
  return {
    schema: 1,
    baseline_commit: R9_BASELINE_SHA,
    run_id: id,
    tester_id: tester,
    environment: env,
    corpus_id: "p43-real-device-v1",
    journey_results: JOURNEY_IDS.map((journeyId) => ({ id: journeyId, result: "PASS" })),
    defects: []
  };
}

function deviceMatrix() {
  return [
    deviceRun("windows", environment()),
    deviceRun("macos", environment({ device_model: "MacBook", os_family: "macos", os_version: "macOS 27.0", browser_family: "safari-webkit", browser_name: "Safari", browser_version: "27.0" })),
    deviceRun("android", environment({ device_class: "phone", device_model: "Android phone", os_family: "android", os_version: "Android 17", browser_name: "Chrome", browser_version: "152.0.0", input_mode: "touch", viewport: "412x915", app_mode: "installed-pwa" })),
    deviceRun("ios", environment({ device_class: "phone", device_model: "iPhone", os_family: "ios", os_version: "iOS 27.0", browser_family: "safari-webkit", browser_name: "Safari", browser_version: "27.0", input_mode: "touch", viewport: "390x844" })),
    deviceRun("ipados", environment({ device_class: "tablet", device_model: "iPad", os_family: "ipados", os_version: "iPadOS 27.0", browser_family: "safari-webkit", browser_name: "Safari", browser_version: "27.0", input_mode: "touch", viewport: "1024x1366" }))
  ];
}

function humanEntry(value) {
  return { session: value, raw: `${JSON.stringify(value, null, 2)}\n` };
}

function deviceEntry(value) {
  return { run: value, raw: `${JSON.stringify(value, null, 2)}\n` };
}

function qualifyingHumanEntries() {
  return [
    humanEntry(session(1, "none")),
    humanEntry(session(2, "light")),
    humanEntry(session(3, "experienced"))
  ];
}

function qualifyingDeviceEntries() {
  return deviceMatrix().map(deviceEntry);
}

test("certifier freezes only combined qualifying human and physical-device evidence", () => {
  const certification = buildCertification(qualifyingHumanEntries(), qualifyingDeviceEntries());
  assert.equal(certification.status, "R9_HUMAN_USABILITY_CERTIFIED");
  assert.equal(certification.human_ux_status, "HUMAN_UX_TARGET_MET");
  assert.equal(certification.real_device_status, "REAL_DEVICE_TARGET_MET");
  assert.equal(certification.product_baseline_commit, R9_BASELINE_SHA);
  assert.equal(certification.evidence.length, 3);
  assert.equal(certification.real_device_evidence.length, 5);
  assert.equal(certification.real_device.matrix.sufficient, true);
  assert.equal(certification.real_device.journeys.sufficient, true);
  assert.equal(certification.real_device.installed_pwa_covered, true);
  assert.match(certification.evidence[0].sha256, /^[0-9a-f]{64}$/);
  assert.match(certification.real_device_evidence[0].sha256, /^[0-9a-f]{64}$/);
});

test("certifier refuses a fully qualifying human sample without real-device evidence", () => {
  assert.throws(
    () => buildCertification(qualifyingHumanEntries(), []),
    /REAL_DEVICE_UNMEASURED/
  );
});

test("certifier refuses a passing but insufficient human sample", () => {
  assert.throws(
    () => buildCertification([humanEntry(session(1, "none"))], qualifyingDeviceEntries()),
    /HUMAN_UX_SAMPLE_INSUFFICIENT/
  );
});

test("certifier refuses human target misses", () => {
  const first = session(1, "none");
  first.first_location[17].correct_first_location = false;
  assert.throws(() => buildCertification([
    humanEntry(first),
    humanEntry(session(2, "light")),
    humanEntry(session(3, "experienced"))
  ], qualifyingDeviceEntries()), /HUMAN_UX_TARGET_MISSED/);
});

test("certifier refuses incomplete real-device matrix", () => {
  const incomplete = qualifyingDeviceEntries().slice(0, 4);
  assert.throws(
    () => buildCertification(qualifyingHumanEntries(), incomplete),
    /REAL_DEVICE_MATRIX_INCOMPLETE/
  );
});
