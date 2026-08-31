import assert from "node:assert/strict";
import test from "node:test";

import { R9_BASELINE_SHA, R9_BUILD_CHANNEL, R9_SESSION_SCHEMA } from "./r9_validate_evidence.mjs";
import { buildSession, deterministicOrder } from "./r9_prepare_session.mjs";

const template = {
  schema: R9_SESSION_SCHEMA,
  baseline_commit: R9_BASELINE_SHA,
  session_id: "placeholder",
  tester_id: "placeholder",
  tester_profile: { familiarity: "none", pdf_experience: "basic" },
  environment: {},
  corpus_id: "r9-manual-v2",
  measurement_order: [],
  first_location: [],
  no_help_completion: [],
  navigation_prediction: [],
  defects: []
};

function options(entries) {
  return new Map(entries);
}

function physicalOptions(extra = []) {
  return options([
    ["session-id", "session-20260831-01"],
    ["tester-id", "tester-01"],
    ["familiarity", "none"],
    ["pdf-experience", "regular"],
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

test("deterministic order is stable, complete, unique, and shuffled", () => {
  const first = deterministicOrder("session-20260831-01");
  const second = deterministicOrder("session-20260831-01");
  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(new Set(first).size, 20);
  assert.notDeepEqual(first, Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`));
});

test("different session IDs produce different measurement order", () => {
  assert.notDeepEqual(
    deterministicOrder("session-20260831-01"),
    deterministicOrder("session-20260831-02")
  );
});

test("buildSession fills attested physical-device metadata and randomized order, not human outcomes", () => {
  const session = buildSession(template, physicalOptions());

  assert.equal(session.session_id, "session-20260831-01");
  assert.equal(session.tester_id, "tester-01");
  assert.deepEqual(session.tester_profile, { familiarity: "none", pdf_experience: "regular" });
  assert.equal(session.environment.physical_device, true);
  assert.equal(session.environment.human_attestation, true);
  assert.equal(session.environment.automation_used_for_observation, false);
  assert.equal(session.environment.browser_name, "Microsoft Edge");
  assert.equal(session.environment.browser_version, "152.0.0");
  assert.equal(session.environment.build_channel, R9_BUILD_CHANNEL);
  assert.equal(session.measurement_order.length, 20);
  assert.deepEqual(session.defects, []);
});

test("buildSession requires explicit physical-device attestation", () => {
  const opts = physicalOptions();
  opts.delete("attest-physical-device");
  assert.throws(() => buildSession(template, opts), /Required option --attest-physical-device is missing/);

  const denied = physicalOptions([["attest-physical-device", "no"]]);
  assert.throws(() => buildSession(template, denied), /must equal yes/);
});

test("buildSession requires tester and device metadata", () => {
  assert.throws(
    () => buildSession(template, options([["session-id", "session-20260831-01"]])),
    /Required option --tester-id is missing/
  );
});
