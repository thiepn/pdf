import assert from "node:assert/strict";
import test from "node:test";

import {
  R9_BASELINE_SHA,
  R9_BUILD_CHANNEL,
  R9_SESSION_SCHEMA,
  summarizeSessions,
  validateSession
} from "./r9_validate_evidence.mjs";

const DISCOVERY_IDS = Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`);
const SHUFFLED_ORDER = [...DISCOVERY_IDS.slice(7), ...DISCOVERY_IDS.slice(0, 7)];
const COMPLETION_MAP = ["D01", "D04", "D05", "D06", "D07", "D10", "D14", "D15", "D18", "D19"];

function sessionFixture({
  sessionId = "session-20260831-01",
  testerId = "tester-01",
  familiarity = "none",
  pdfExperience = "basic",
  firstCorrect = 20,
  noHelpCorrect = 10,
  predictionCorrect = 20,
  defects = [],
  measurementOrder = SHUFFLED_ORDER,
  environment = {}
} = {}) {
  return {
    schema: R9_SESSION_SCHEMA,
    baseline_commit: R9_BASELINE_SHA,
    session_id: sessionId,
    tester_id: testerId,
    tester_profile: {
      familiarity,
      pdf_experience: pdfExperience
    },
    environment: {
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
      ...environment
    },
    corpus_id: "r9-manual-v2",
    measurement_order: [...measurementOrder],
    first_location: Array.from({ length: 20 }, (_, index) => ({
      id: `D${String(index + 1).padStart(2, "0")}`,
      intent: `Intent ${index + 1}`,
      first_location: "Canonical destination",
      correct_first_location: index < firstCorrect,
      help_used_before_choice: false,
      meaningful_interactions: 1
    })),
    no_help_completion: Array.from({ length: 10 }, (_, index) => ({
      id: `C${String(index + 1).padStart(2, "0")}`,
      workflow: `Workflow ${index + 1}`,
      measured_during: COMPLETION_MAP[index],
      completed_without_help: index < noHelpCorrect,
      result: index < noHelpCorrect ? "PASS" : "FAIL"
    })),
    navigation_prediction: Array.from({ length: 20 }, (_, index) => ({
      id: `D${String(index + 1).padStart(2, "0")}`,
      predicted_location: "Canonical destination",
      matches_canonical: index < predictionCorrect
    })),
    defects
  };
}

function threePassingSessions() {
  return [
    sessionFixture({ sessionId: "session-20260831-01", testerId: "tester-01", familiarity: "none", firstCorrect: 18, noHelpCorrect: 9, predictionCorrect: 18 }),
    sessionFixture({ sessionId: "session-20260831-02", testerId: "tester-02", familiarity: "light", firstCorrect: 18, noHelpCorrect: 9, predictionCorrect: 18 }),
    sessionFixture({ sessionId: "session-20260831-03", testerId: "tester-03", familiarity: "experienced", firstCorrect: 18, noHelpCorrect: 9, predictionCorrect: 18 })
  ];
}

test("no session evidence remains HUMAN_UX_UNMEASURED", () => {
  const summary = summarizeSessions([]);
  assert.equal(summary.status, "HUMAN_UX_UNMEASURED");
  assert.equal(summary.sessions, 0);
  assert.equal(summary.physical_device_sessions, 0);
  assert.equal(summary.metrics, null);
});

test("one passing physical-device human session remains sample-insufficient", () => {
  const summary = summarizeSessions([sessionFixture({ firstCorrect: 18, noHelpCorrect: 9, predictionCorrect: 18 })]);
  assert.equal(summary.status, "HUMAN_UX_SAMPLE_INSUFFICIENT");
  assert.equal(summary.sample.distinct_testers, 1);
  assert.equal(summary.sample.sufficient, false);
});

test("three distinct physical-device testers with two low-familiarity testers and exact 90 percent meet target", () => {
  const summary = summarizeSessions(threePassingSessions());
  assert.equal(summary.status, "HUMAN_UX_TARGET_MET");
  assert.equal(summary.sample.distinct_testers, 3);
  assert.equal(summary.sample.low_familiarity_testers, 2);
  assert.equal(summary.sample.sufficient, true);
  assert.equal(summary.physical_device_sessions, 3);
  assert.deepEqual(summary.metrics.first_location_accuracy, {
    numerator: 54,
    denominator: 60,
    rate: 0.9,
    target: 0.9,
    met: true
  });
});

test("three passing sessions from only two distinct testers remain sample-insufficient", () => {
  const sessions = threePassingSessions();
  sessions[2].tester_id = "tester-02";
  sessions[2].tester_profile = { ...sessions[1].tester_profile };
  const summary = summarizeSessions(sessions);
  assert.equal(summary.status, "HUMAN_UX_SAMPLE_INSUFFICIENT");
  assert.equal(summary.sample.distinct_testers, 2);
});

test("sample with fewer than two low-familiarity testers remains insufficient", () => {
  const sessions = threePassingSessions();
  sessions[1].tester_profile.familiarity = "experienced";
  const summary = summarizeSessions(sessions);
  assert.equal(summary.status, "HUMAN_UX_SAMPLE_INSUFFICIENT");
  assert.equal(summary.sample.low_familiarity_testers, 1);
});

test("an individual session below one target produces HUMAN_UX_TARGET_MISSED", () => {
  const sessions = threePassingSessions();
  sessions[0] = sessionFixture({ sessionId: "session-20260831-01", testerId: "tester-01", familiarity: "none", firstCorrect: 17 });
  const summary = summarizeSessions(sessions);
  assert.equal(summary.status, "HUMAN_UX_TARGET_MISSED");
  assert.equal(summary.session_metrics[0].first_location_accuracy.met, false);
});

test("wrong baseline commit is rejected", () => {
  const session = sessionFixture();
  session.baseline_commit = "0000000000000000000000000000000000000000";
  assert.throws(() => validateSession(session), /baseline_commit must equal frozen R9 baseline/);
});

test("simulator, automation, and missing human attestation are rejected", () => {
  assert.throws(
    () => validateSession(sessionFixture({ environment: { simulator_or_emulator: true } })),
    /simulator_or_emulator must be false/
  );
  assert.throws(
    () => validateSession(sessionFixture({ environment: { automation_used_for_observation: true } })),
    /automation_used_for_observation must be false/
  );
  assert.throws(
    () => validateSession(sessionFixture({ environment: { human_attestation: false } })),
    /human_attestation must be true/
  );
});

test("exact OS and browser versions are required", () => {
  assert.throws(
    () => validateSession(sessionFixture({ environment: { os_version: "latest" } })),
    /os_version must include an exact version number/
  );
  assert.throws(
    () => validateSession(sessionFixture({ environment: { browser_version: "latest" } })),
    /browser_version must include an exact version number/
  );
});

test("duplicate frozen IDs are rejected", () => {
  const session = sessionFixture();
  session.first_location[19].id = "D01";
  assert.throws(() => validateSession(session), /duplicate IDs/);
});

test("canonical sorted measurement order is rejected", () => {
  const session = sessionFixture({ measurementOrder: DISCOVERY_IDS });
  assert.throws(() => validateSession(session), /measurement_order must be shuffled/);
});

test("wrong completion-to-discovery mapping is rejected", () => {
  const session = sessionFixture();
  session.no_help_completion[0].measured_during = "D02";
  assert.throws(() => validateSession(session), /measured_during must equal D01/);
});

test("incomplete measured values are rejected rather than inferred", () => {
  const session = sessionFixture();
  session.navigation_prediction[0].matches_canonical = null;
  assert.throws(() => validateSession(session), /must be boolean human evidence/);
});

test("privacy-sensitive evidence fields are rejected recursively", () => {
  const session = sessionFixture();
  session.defects.push({
    severity: "low",
    category: "usability",
    status: "open",
    description: "Non-sensitive observation",
    password: "must-never-be-recorded"
  });
  assert.throws(() => validateSession(session), /Privacy-sensitive field 'password' is forbidden/);
});

test("unresolved critical or data-loss defects block certification", () => {
  const sessions = threePassingSessions();
  sessions[0].defects.push({
    severity: "critical",
    category: "product-defect",
    status: "open",
    description: "Release-blocking defect observed during the session"
  });
  const summary = summarizeSessions(sessions);
  assert.equal(summary.status, "R9_BLOCKED_BY_PRODUCT_DEFECT");
  assert.equal(summary.blocking_defects.length, 1);
});
