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

function certification(overrides = {}) {
  return {
    schema: 1,
    status: "R9_HUMAN_USABILITY_CERTIFIED",
    product_baseline_commit: R8_FROZEN_PRODUCT_BASELINE,
    human_ux_status: "HUMAN_UX_TARGET_MET",
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
    blocking_defects: [],
    evidence: [
      { session_id: "s1", tester_id: "t1", sha256: "a".repeat(64) },
      { session_id: "s2", tester_id: "t2", sha256: "b".repeat(64) },
      { session_id: "s3", tester_id: "t3", sha256: "c".repeat(64) }
    ],
    ...overrides
  };
}

function maintenance(overrides = {}) {
  const item = {
    schema: 1,
    change_id: "R10-MAINT-20260825-01",
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

function digest(raw) {
  const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

test("R10 remains blocked while R9 certification is absent", () => {
  const result = evaluateR10({ baseline: baseline() });
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
});

test("valid R9 certification with no blocking maintenance becomes operationally ready", () => {
  const result = evaluateR10({ baseline: baseline(), r9Certification: certification() });
  assert.equal(result.status, "R10_OPERATIONAL_READY");
});

test("R9 certification for a different product baseline is rejected", () => {
  const result = evaluateR10({
    baseline: baseline(),
    r9Certification: certification({ product_baseline_commit: "f".repeat(40) })
  });
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
  assert.match(result.reason, /does not match/);
});

test("insufficient R9 sample cannot open R10", () => {
  const cert = certification();
  cert.sample.sufficient = false;
  const result = evaluateR10({ baseline: baseline(), r9Certification: cert });
  assert.equal(result.status, "R10_BLOCKED_BY_R9");
});

test("invalid maintenance evidence blocks R10 by policy", () => {
  const item = maintenance();
  item.password = "forbidden";
  const result = evaluateR10({ baseline: baseline(), r9Certification: certification(), maintenanceRecords: [item] });
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
  const result = evaluateR10({ baseline: baseline(), r9Certification: certification(), maintenanceRecords: [item] });
  assert.equal(result.status, "R10_BLOCKED_BY_CRITICAL_MAINTENANCE");
});

test("maintenance-derived baseline must reference a qualified matching change", () => {
  const item = maintenance({
    change_id: "R10-MAINT-20260825-02",
    change_class: "product-hotfix",
    product_behavior_changed: true,
    affected_workflows: ["Edit PDF"],
    required_gates: { engineering_requalification: true, human_requalification: true },
    gate_results: { engineering_requalification: true, human_requalification: true },
    status: "qualified"
  });
  const result = evaluateR10({
    baseline: baseline({ product_baseline_commit: item.target_commit, maintenance_change_id: item.change_id, source: "R10_MAINTENANCE" }),
    r9Certification: certification({ product_baseline_commit: item.target_commit }),
    maintenanceRecords: [item]
  });
  assert.equal(result.status, "R10_OPERATIONAL_READY");
});

test("committed human evidence digests are verified when supplied", () => {
  const raws = [
    JSON.stringify({ session_id: "s1", tester_id: "t1" }),
    JSON.stringify({ session_id: "s2", tester_id: "t2" }),
    JSON.stringify({ session_id: "s3", tester_id: "t3" })
  ];
  const cert = certification({
    evidence: raws.map((raw, index) => ({
      session_id: `s${index + 1}`,
      tester_id: `t${index + 1}`,
      sha256: digest(raw)
    }))
  });
  const sessionEntries = raws.map((raw) => ({ raw, session: JSON.parse(raw) }));
  const result = evaluateR10({ baseline: baseline(), r9Certification: cert, sessionEntries });
  assert.equal(result.status, "R10_OPERATIONAL_READY");

  sessionEntries[0].raw = `${sessionEntries[0].raw} `;
  const tampered = evaluateR10({ baseline: baseline(), r9Certification: cert, sessionEntries });
  assert.equal(tampered.status, "R10_BLOCKED_BY_R9");
  assert.match(tampered.reason, /digest mismatch/);
});
