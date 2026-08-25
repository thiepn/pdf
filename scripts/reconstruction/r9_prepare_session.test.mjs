import assert from "node:assert/strict";
import test from "node:test";

import { buildSession, deterministicOrder } from "./r9_prepare_session.mjs";

const template = {
  schema: 2,
  baseline_commit: "7c81f95815a3d8740fddef3d76e264ebb19c96f8",
  session_id: "placeholder",
  tester_id: "placeholder",
  tester_profile: { familiarity: "none", pdf_experience: "basic" },
  environment: { date: "", browser: "", os_device: "", viewport: "", build_channel: "r8-frozen-baseline" },
  corpus_id: "r9-manual-v1",
  measurement_order: [],
  first_location: [],
  no_help_completion: [],
  navigation_prediction: [],
  defects: []
};

function options(entries) {
  return new Map(entries);
}

test("deterministic order is stable, complete, unique, and shuffled", () => {
  const first = deterministicOrder("session-20260825-01");
  const second = deterministicOrder("session-20260825-01");
  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(new Set(first).size, 20);
  assert.notDeepEqual(first, Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`));
});

test("different session IDs produce different measurement order", () => {
  assert.notDeepEqual(
    deterministicOrder("session-20260825-01"),
    deterministicOrder("session-20260825-02")
  );
});

test("buildSession fills only metadata and randomized order, not human outcomes", () => {
  const session = buildSession(template, options([
    ["session-id", "session-20260825-01"],
    ["tester-id", "tester-01"],
    ["familiarity", "none"],
    ["pdf-experience", "regular"],
    ["browser", "Edge 151"],
    ["os-device", "Windows 11 laptop"],
    ["viewport", "1440x900"],
    ["date", "2026-08-25"],
    ["corpus-id", "r9-manual-v1"]
  ]));

  assert.equal(session.session_id, "session-20260825-01");
  assert.equal(session.tester_id, "tester-01");
  assert.deepEqual(session.tester_profile, { familiarity: "none", pdf_experience: "regular" });
  assert.equal(session.environment.browser, "Edge 151");
  assert.equal(session.environment.build_channel, "r8-frozen-baseline");
  assert.equal(session.measurement_order.length, 20);
  assert.deepEqual(session.defects, []);
});

test("buildSession requires tester and environment metadata", () => {
  assert.throws(
    () => buildSession(template, options([["session-id", "session-20260825-01"]])),
    /Required option --tester-id is missing/
  );
});
