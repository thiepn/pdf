import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { evaluateR10, R8_FROZEN_PRODUCT_BASELINE } from "./r10_gate.mjs";

function baseline(overrides = {}) {
  return {
    schema: 1,
    product_baseline_commit: R8_FROZEN_PRODUCT_BASELINE,
    source: "R8_RECONSTRUCTION_FROZEN",
    maintenance_change_id: null,
    ...overrides
  };
}

function digest(raw) {
  const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function humanEntries() {
  return [1, 2, 3].map((number) => {
    const session = { session_id: `s${number}`, tester_id: `t${number}` };
    return { raw: JSON.stringify(session), session };
  });
}

function deviceEntries() {
  return [1, 2, 3, 4, 5].map((number) => {
    const run = { run_id: `d${number}`, tester_id: `dt${number}` };
    return { raw: JSON.stringify(run), run };
  });
}

function certification({ sessions = humanEntries(), devices = deviceEntries(), ...overrides } = {}) {
  return {
    schema: 1,
    status: "R9_HUMAN_USABILITY_CERTIFIED",
    product_baseline_commit: R8_FROZEN_PRODUCT_BASELINE,
    human_ux_status: "HUMAN_UX_TARGET_MET",
    real_device_status: "REAL_DEVICE_TARGET_MET",
    sample: {
      distinct_testers: 3,
      low_familiarity_testers: 2,
      minimum_distinct_testers: 3,
      minimum_low_familiarity_testers: 2,
      sufficient: true
    },
    metrics: {
      first_location_accuracy: { met: true },
      no_help_completion: { met: true },
      navigation_prediction_accuracy: { met: true }
    },
    session_metrics: [],
    real_device: {
      matrix: { required_slots: 5, covered_slots: 5, sufficient: true, slots: [] },
      journeys: { required: 10, covered: 10, sufficient: true, items: [] },
      installed_pwa_covered: true,
      blocking_defects: []
    },
    blocking_defects: [],
    evidence: sessions.map((entry) => ({
      session_id: entry.session.session_id,
      tester_id: entry.session.tester_id,
      sha256: digest(entry.raw)
    })),
    real_device_evidence: devices.map((entry) => ({
      run_id: entry.run.run_id,
      tester_id: entry.run.tester_id,
      sha256: digest(entry.raw)
    })),
    ...overrides
  };
}

function evidenceBundle(overrides = {}) {
  const sessions = overrides.sessions || humanEntries();
  const devices = overrides.devices || deviceEntries();
  return {
    sessions,
    devices,
    cert: certification({ sessions, devices, ...(overrides.cert || {}) })
  };
}

function maintenance(overrides = {}) {
  const item = {
    schema: 1,
    change_id: "R10-MAINT-20260831-01",
    change_class: "documentation-tooling",
    base_commit: "1".repeat(40),
    target_commit: "2".repeat(40),
    product_behavior_changed: false,
    risk: { severity: "low", data_loss_risk: false, security_privacy_risk: false },
    reason: "Operational documentation update",
    rollback_commit: "1".repeat(40),
    affected_workflows: [],
    required_gates: {
      engineering_requalification: false,
      human_requalification: false,
      security_privacy_gate: false
    },
    gate_results: {
      engineering_requalification: null,
      human_requalification: null,
      security_privacy_gate: null
    },
    status: "planned",
    notes: ""
  };
  return {
    ...item,
    ...overrides,
    risk: { ...item.risk, ...(overrides.risk || {}) },
    required_gates: { ...item.required_gates, ...(overrides.required_gates || {}) },
    gate_results: { ...item.gate_results, ...(overrides.gate_results || {}) }
  };
}

function evaluate(bundle, options = {}) {
  return evaluateR10({
    baseline: options.baseline || baseline(),
    r9Certification: bundle?.cert || null,
    maintenanceRecords: options.maintenanceRecords || [],
    sessionEntries: bundle?.sessions || [],
    deviceEntries: bundle?.devices || []
  });
}

test("R10 remains blocked while R9 certification is absent", () => {
  const result = evaluate(null);
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
});

test("valid combined human and real-device certification becomes operationally ready", () => {
  const result = evaluate(evidenceBundle());
  assert.equal(result.status, "R10_OPERATIONAL_READY");
  assert.equal(result.real_device_status, "REAL_DEVICE_TARGET_MET");
});

test("human-only legacy certification cannot open R10", () => {
  const bundle = evidenceBundle();
  delete bundle.cert.real_device_status;
  delete bundle.cert.real_device;
  delete bundle.cert.real_device_evidence;
  const result = evaluate(bundle);
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
  assert.match(result.reason, /real-device target is not met/);
});

test("R9 certification for a different product baseline is rejected", () => {
  const bundle = evidenceBundle({ cert: { product_baseline_commit: "f".repeat(40) } });
  const result = evaluate(bundle);
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
  assert.match(result.reason, /does not match/);
});

test("insufficient R9 sample cannot open R10", () => {
  const bundle = evidenceBundle();
  bundle.cert.sample.sufficient = false;
  const result = evaluate(bundle);
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
});

test("missing underlying human or real-device evidence cannot open R10", () => {
  const bundle = evidenceBundle();
  const missingHuman = evaluate({ ...bundle, sessions: [] });
  assert.equal(missingHuman.status, "R10_BLOCKED_BY_R9");
  assert.match(missingHuman.reason, /human evidence count/);

  const missingDevices = evaluate({ ...bundle, devices: [] });
  assert.equal(missingDevices.status, "R10_BLOCKED_BY_R9");
  assert.match(missingDevices.reason, /real-device evidence count/);
});

test("invalid maintenance evidence blocks R10 by policy", () => {
  const item = maintenance();
  item.password = "forbidden";
  const result = evaluate(evidenceBundle(), { maintenanceRecords: [item] });
  assert.equal(result.status, "R10_BLOCKED_BY_POLICY");
});

test("unresolved emergency maintenance blocks operational readiness", () => {
  const item = maintenance({
    change_class: "security-privacy-data-loss-emergency",
    product_behavior_changed: true,
    risk: { severity: "critical", data_loss_risk: true },
    affected_workflows: ["Export PDF content"],
    required_gates: {
      engineering_requalification: true,
      human_requalification: true,
      security_privacy_gate: true
    },
    status: "in-progress"
  });
  const result = evaluate(evidenceBundle(), { maintenanceRecords: [item] });
  assert.equal(result.status, "R10_BLOCKED_BY_CRITICAL_MAINTENANCE");
});

test("maintenance-derived baseline must reference a qualified matching change", () => {
  const item = maintenance({
    change_id: "R10-MAINT-20260831-02",
    change_class: "product-hotfix",
    product_behavior_changed: true,
    affected_workflows: ["Consumer task discovery"],
    required_gates: { engineering_requalification: true, human_requalification: true },
    gate_results: { engineering_requalification: true, human_requalification: true },
    status: "qualified"
  });
  const bundle = evidenceBundle({ cert: { product_baseline_commit: item.target_commit } });
  const result = evaluate(bundle, {
    baseline: baseline({ product_baseline_commit: item.target_commit, maintenance_change_id: item.change_id, source: "R10_MAINTENANCE" }),
    maintenanceRecords: [item]
  });
  assert.equal(result.status, "R10_OPERATIONAL_READY");
});

test("committed human and real-device evidence digests are verified", () => {
  const bundle = evidenceBundle();
  assert.equal(evaluate(bundle).status, "R10_OPERATIONAL_READY");

  bundle.sessions[0].raw = `${bundle.sessions[0].raw} `;
  const tamperedHuman = evaluate(bundle);
  assert.equal(tamperedHuman.status, "R10_BLOCKED_BY_R9");
  assert.match(tamperedHuman.reason, /human evidence digest mismatch/);

  const fresh = evidenceBundle();
  fresh.devices[0].raw = `${fresh.devices[0].raw} `;
  const tamperedDevice = evaluate(fresh);
  assert.equal(tamperedDevice.status, "R10_BLOCKED_BY_R9");
  assert.match(tamperedDevice.reason, /real-device evidence digest mismatch/);
});
