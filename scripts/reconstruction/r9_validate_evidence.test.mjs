import assert from "node:assert/strict";
import test from "node:test";

import {
  R9_BASELINE_SHA,
  summarizeSessions,
  validateSession
} from "./r9_validate_evidence.mjs";

function sessionFixture({
  firstCorrect = 20,
  noHelpCorrect = 10,
  predictionCorrect = 20,
  defects = []
} = {}) {
  return {
    schema: 1,
    baseline_commit: R9_BASELINE_SHA,
    session_id: "session-20260825-01",
    tester_id: "tester-01",
    environment: {
      date: "2026-08-25",
      browser: "Chromium",
      os_device: "Desktop test device",
      viewport: "1440x900",
      build_channel: "frozen-main"
    },
    corpus_id: "r9-public-corpus-01",
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

test("no session evidence remains HUMAN_UX_UNMEASURED", () => {
  const summary = summarizeSessions([]);
  assert.equal(summary.status, "HUMAN_UX_UNMEASURED");
  assert.equal(summary.sessions, 0);
  assert.equal(summary.metrics, null);
});

test("exact 90 percent on every frozen metric meets the target", () => {
  const summary = summarizeSessions([sessionFixture({
    firstCorrect: 18,
    noHelpCorrect: 9,
    predictionCorrect: 18
  })]);

  assert.equal(summary.status, "HUMAN_UX_TARGET_MET");
  assert.deepEqual(summary.metrics.first_location_accuracy, {
    numerator: 18,
    denominator: 20,
    rate: 0.9,
    target: 0.9,
    met: true
  });
  assert.equal(summary.metrics.no_help_completion.met, true);
  assert.equal(summary.metrics.navigation_prediction_accuracy.met, true);
});

test("a complete session below one target is HUMAN_UX_TARGET_MISSED", () => {
  const summary = summarizeSessions([sessionFixture({ firstCorrect: 17 })]);
  assert.equal(summary.status, "HUMAN_UX_TARGET_MISSED");
  assert.equal(summary.metrics.first_location_accuracy.met, false);
});

test("wrong baseline commit is rejected", () => {
  const session = sessionFixture();
  session.baseline_commit = "0000000000000000000000000000000000000000";
  assert.throws(() => validateSession(session), /baseline_commit must equal frozen R9 baseline/);
});

test("duplicate frozen IDs are rejected", () => {
  const session = sessionFixture();
  session.first_location[19].id = "D01";
  assert.throws(() => validateSession(session), /duplicate IDs/);
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
  const summary = summarizeSessions([sessionFixture({
    defects: [{
      severity: "critical",
      category: "product-defect",
      status: "open",
      description: "Release-blocking defect observed during the session"
    }]
  })]);

  assert.equal(summary.status, "R9_BLOCKED_BY_PRODUCT_DEFECT");
  assert.equal(summary.blocking_defects.length, 1);
});
