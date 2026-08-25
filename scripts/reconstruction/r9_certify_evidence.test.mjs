import assert from "node:assert/strict";
import test from "node:test";

import { buildCertification } from "./r9_certify_evidence.mjs";
import { R9_BASELINE_SHA } from "./r9_validate_evidence.mjs";

const D = Array.from({ length: 20 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`);
const ORDER = [...D.slice(5), ...D.slice(0, 5)];
const MAP = ["D01", "D04", "D05", "D06", "D07", "D10", "D14", "D15", "D18", "D19"];

function session(n, familiarity) {
  const tester = `tester-${n}`;
  const value = {
    schema: 2,
    baseline_commit: R9_BASELINE_SHA,
    session_id: `session-20260825-0${n}`,
    tester_id: tester,
    tester_profile: { familiarity, pdf_experience: "regular" },
    environment: { date: "2026-08-25", browser: "Chromium", os_device: "Test device", viewport: "1440x900", build_channel: "r8-frozen-baseline" },
    corpus_id: "r9-manual-v1",
    measurement_order: [...ORDER],
    first_location: D.map((id, i) => ({ id, intent: `Intent ${i + 1}`, first_location: "Canonical destination", correct_first_location: i < 18, help_used_before_choice: false, meaningful_interactions: 1 })),
    no_help_completion: MAP.map((measured_during, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, workflow: `Workflow ${i + 1}`, measured_during, completed_without_help: i < 9, result: i < 9 ? "PASS" : "FAIL" })),
    navigation_prediction: D.map((id, i) => ({ id, predicted_location: "Canonical destination", matches_canonical: i < 18 })),
    defects: []
  };
  return value;
}

function entry(value) {
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  return { session: value, raw };
}

test("certifier freezes only a fully qualifying three-tester sample", () => {
  const certification = buildCertification([
    entry(session(1, "none")),
    entry(session(2, "light")),
    entry(session(3, "experienced"))
  ]);
  assert.equal(certification.status, "R9_HUMAN_USABILITY_CERTIFIED");
  assert.equal(certification.human_ux_status, "HUMAN_UX_TARGET_MET");
  assert.equal(certification.product_baseline_commit, R9_BASELINE_SHA);
  assert.equal(certification.evidence.length, 3);
  assert.match(certification.evidence[0].sha256, /^[0-9a-f]{64}$/);
});

test("certifier refuses a passing but insufficient sample", () => {
  assert.throws(() => buildCertification([entry(session(1, "none"))]), /HUMAN_UX_SAMPLE_INSUFFICIENT/);
});

test("certifier refuses measured target misses", () => {
  const first = session(1, "none");
  first.first_location[17].correct_first_location = false;
  assert.throws(() => buildCertification([
    entry(first),
    entry(session(2, "light")),
    entry(session(3, "experienced"))
  ]), /HUMAN_UX_TARGET_MISSED/);
});
