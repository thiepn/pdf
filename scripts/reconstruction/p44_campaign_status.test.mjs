import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCampaignStatus,
  validateCampaignPlan
} from "./p44_campaign_status.mjs";
import {
  MIN_DISTINCT_TESTERS,
  MIN_LOW_FAMILIARITY_TESTERS,
  R9_BASELINE_SHA
} from "./r9_validate_evidence.mjs";
import {
  JOURNEY_IDS,
  REQUIRED_DEVICE_SLOTS
} from "./r9_validate_real_device.mjs";

function plan(overrides = {}) {
  const base = {
    schema: 1,
    phase: "P44",
    product_baseline_commit: R9_BASELINE_SHA,
    human_requirements: {
      minimum_distinct_testers: MIN_DISTINCT_TESTERS,
      minimum_low_familiarity_testers: MIN_LOW_FAMILIARITY_TESTERS,
      individual_metric_target: 0.9,
      aggregate_metric_target: 0.9
    },
    required_device_slots: REQUIRED_DEVICE_SLOTS.map((slot) => slot.id),
    required_journeys: [...JOURNEY_IDS],
    installed_pwa_recovery_journey: "J10",
    certification_requires: ["HUMAN_UX_TARGET_MET", "REAL_DEVICE_TARGET_MET"],
    evidence_policy: {
      human_physical_device_only: true,
      automation_may_generate_observations: false,
      placeholder_evidence_allowed: false,
      failed_observations_must_be_preserved: true
    }
  };
  return {
    ...base,
    ...overrides,
    human_requirements: { ...base.human_requirements, ...(overrides.human_requirements || {}) },
    evidence_policy: { ...base.evidence_policy, ...(overrides.evidence_policy || {}) }
  };
}

function humanSummary(overrides = {}) {
  const base = {
    status: "HUMAN_UX_UNMEASURED",
    sessions: 0,
    sample: {
      distinct_testers: 0,
      low_familiarity_testers: 0,
      sufficient: false
    },
    metrics: null,
    blocking_defects: []
  };
  return {
    ...base,
    ...overrides,
    sample: { ...base.sample, ...(overrides.sample || {}) }
  };
}

function deviceSummary(overrides = {}) {
  const base = {
    status: "REAL_DEVICE_UNMEASURED",
    runs: 0,
    matrix: {
      required_slots: REQUIRED_DEVICE_SLOTS.length,
      covered_slots: 0,
      sufficient: false,
      slots: REQUIRED_DEVICE_SLOTS.map((slot) => ({ id: slot.id, covered: false, run_ids: [] }))
    },
    journeys: {
      required: JOURNEY_IDS.length,
      covered: 0,
      sufficient: false,
      items: JOURNEY_IDS.map((id) => ({ id, covered: false, qualifying_run_ids: [], failing_run_ids: [] }))
    },
    installed_pwa_covered: false,
    blocking_defects: []
  };
  return {
    ...base,
    ...overrides,
    matrix: { ...base.matrix, ...(overrides.matrix || {}) },
    journeys: { ...base.journeys, ...(overrides.journeys || {}) }
  };
}

function passingHumanSummary() {
  return humanSummary({
    status: "HUMAN_UX_TARGET_MET",
    sessions: 3,
    sample: {
      distinct_testers: 3,
      low_familiarity_testers: 2,
      sufficient: true
    },
    metrics: {
      first_location_accuracy: { met: true },
      no_help_completion: { met: true },
      navigation_prediction_accuracy: { met: true }
    }
  });
}

function passingDeviceSummary() {
  return deviceSummary({
    status: "REAL_DEVICE_TARGET_MET",
    runs: 5,
    matrix: {
      required_slots: REQUIRED_DEVICE_SLOTS.length,
      covered_slots: REQUIRED_DEVICE_SLOTS.length,
      sufficient: true,
      slots: REQUIRED_DEVICE_SLOTS.map((slot, index) => ({ id: slot.id, covered: true, run_ids: [`run-${index + 1}`] }))
    },
    journeys: {
      required: JOURNEY_IDS.length,
      covered: JOURNEY_IDS.length,
      sufficient: true,
      items: JOURNEY_IDS.map((id) => ({ id, covered: true, qualifying_run_ids: ["run-1"], failing_run_ids: [] }))
    },
    installed_pwa_covered: true
  });
}

function certification(overrides = {}) {
  return {
    schema: 1,
    status: "R9_HUMAN_USABILITY_CERTIFIED",
    product_baseline_commit: R9_BASELINE_SHA,
    human_ux_status: "HUMAN_UX_TARGET_MET",
    real_device_status: "REAL_DEVICE_TARGET_MET",
    ...overrides
  };
}

test("campaign plan matches the frozen P43 evidence contract", () => {
  assert.equal(validateCampaignPlan(plan()).phase, "P44");
});

test("campaign plan rejects missing physical-device slots", () => {
  const value = plan({ required_device_slots: REQUIRED_DEVICE_SLOTS.slice(1).map((slot) => slot.id) });
  assert.throws(() => validateCampaignPlan(value), /required_device_slots/);
});

test("empty evidence produces ready-for-fieldwork with complete gap list", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: humanSummary(),
    deviceSummary: deviceSummary()
  });
  assert.equal(result.status, "P44_CAMPAIGN_READY_FOR_FIELDWORK");
  assert.equal(result.human.missing_distinct_testers, 3);
  assert.equal(result.human.missing_low_familiarity_testers, 2);
  assert.equal(result.real_device.missing_slots.length, 5);
  assert.equal(result.real_device.missing_journeys.length, 10);
  assert.equal(result.real_device.installed_pwa_recovery_covered, false);
  assert.ok(result.next_actions.some((item) => item.includes("distinct tester")));
});

test("partial physical evidence produces in-progress state", () => {
  const slots = REQUIRED_DEVICE_SLOTS.map((slot, index) => ({
    id: slot.id,
    covered: index === 0,
    run_ids: index === 0 ? ["run-1"] : []
  }));
  const journeys = JOURNEY_IDS.map((id, index) => ({
    id,
    covered: index < 2,
    qualifying_run_ids: index < 2 ? ["run-1"] : [],
    failing_run_ids: []
  }));
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: humanSummary({
      status: "HUMAN_UX_SAMPLE_INSUFFICIENT",
      sessions: 1,
      sample: { distinct_testers: 1, low_familiarity_testers: 1, sufficient: false }
    }),
    deviceSummary: deviceSummary({
      status: "REAL_DEVICE_MATRIX_INCOMPLETE",
      runs: 1,
      matrix: { covered_slots: 1, slots },
      journeys: { covered: 2, items: journeys }
    })
  });
  assert.equal(result.status, "P44_CAMPAIGN_IN_PROGRESS");
  assert.equal(result.human.missing_distinct_testers, 2);
  assert.equal(result.real_device.missing_slots.length, 4);
  assert.equal(result.real_device.missing_journeys.length, 8);
});

test("both measured targets met without certificate becomes ready to certify", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: passingHumanSummary(),
    deviceSummary: passingDeviceSummary()
  });
  assert.equal(result.status, "P44_CAMPAIGN_READY_TO_CERTIFY");
  assert.equal(result.next_actions.length, 1);
  assert.match(result.next_actions[0], /r9_certify_evidence/);
});

test("valid combined certificate produces certified campaign state", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: passingHumanSummary(),
    deviceSummary: passingDeviceSummary(),
    certification: certification()
  });
  assert.equal(result.status, "P44_CAMPAIGN_CERTIFIED");
  assert.equal(result.certification.valid, true);
  assert.match(result.next_actions[0], /R10 product-baseline promotion/);
});

test("invalid certificate cannot silently promote a campaign", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: passingHumanSummary(),
    deviceSummary: passingDeviceSummary(),
    certification: certification({ real_device_status: "REAL_DEVICE_MATRIX_INCOMPLETE" })
  });
  assert.equal(result.status, "P44_CAMPAIGN_BLOCKED");
  assert.equal(result.certification.valid, false);
});

test("measured target misses block campaign even without critical defect", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: humanSummary({ status: "HUMAN_UX_TARGET_MISSED", sessions: 3 }),
    deviceSummary: passingDeviceSummary()
  });
  assert.equal(result.status, "P44_CAMPAIGN_BLOCKED");
  assert.match(result.next_actions[0], /Preserve failed evidence/);
});

test("blocking data-loss defect blocks campaign and remains visible", () => {
  const result = buildCampaignStatus({
    plan: plan(),
    humanSummary: humanSummary({
      status: "R9_BLOCKED_BY_PRODUCT_DEFECT",
      sessions: 1,
      blocking_defects: [{ session_id: "s1", tester_id: "t1", severity: "high", category: "data-loss", status: "open", description: "Synthetic test description" }]
    }),
    deviceSummary: deviceSummary()
  });
  assert.equal(result.status, "P44_CAMPAIGN_BLOCKED");
  assert.equal(result.blocking_defects.length, 1);
  assert.equal(result.blocking_defects[0].source, "human-session");
});
