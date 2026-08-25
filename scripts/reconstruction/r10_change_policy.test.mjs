import assert from "node:assert/strict";
import test from "node:test";

import { requiredPolicy, validateMaintenanceRecord } from "./r10_change_policy.mjs";

function record(overrides = {}) {
  const base = {
    schema: 1,
    change_id: "R10-MAINT-20260825-01",
    change_class: "documentation-tooling",
    base_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    target_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    product_behavior_changed: false,
    risk: { severity: "low", data_loss_risk: false, security_privacy_risk: false },
    reason: "Qualification tooling maintenance",
    rollback_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
    ...base,
    ...overrides,
    risk: { ...base.risk, ...(overrides.risk || {}) },
    required_gates: { ...base.required_gates, ...(overrides.required_gates || {}) },
    gate_results: { ...base.gate_results, ...(overrides.gate_results || {}) }
  };
}

test("documentation/tooling maintenance does not inherit product gates", () => {
  const item = record();
  assert.deepEqual(requiredPolicy(item), {
    engineering_requalification: false,
    human_requalification: false,
    security_privacy_gate: false
  });
  assert.equal(validateMaintenanceRecord(item), item);
});

test("dependency maintenance always requires engineering requalification", () => {
  const item = record({
    change_class: "dependency-toolchain",
    required_gates: { engineering_requalification: true }
  });
  assert.equal(requiredPolicy(item).engineering_requalification, true);
  validateMaintenanceRecord(item);
});

test("dependency maintenance requires human qualification when behavior changes", () => {
  const item = record({
    change_class: "dependency-toolchain",
    product_behavior_changed: true,
    affected_workflows: ["OCR PDF"],
    required_gates: { engineering_requalification: true, human_requalification: true }
  });
  validateMaintenanceRecord(item);
});

test("product hotfix requires engineering and human requalification", () => {
  const item = record({
    change_class: "product-hotfix",
    product_behavior_changed: true,
    affected_workflows: ["Edit PDF"],
    required_gates: { engineering_requalification: true, human_requalification: true }
  });
  assert.deepEqual(requiredPolicy(item), {
    engineering_requalification: true,
    human_requalification: true,
    security_privacy_gate: false
  });
  validateMaintenanceRecord(item);
});

test("security/privacy or data-loss risk must use emergency class", () => {
  const item = record({
    change_class: "product-hotfix",
    product_behavior_changed: true,
    risk: { data_loss_risk: true },
    affected_workflows: ["Organize pages"],
    required_gates: { engineering_requalification: true, human_requalification: true }
  });
  assert.throws(() => validateMaintenanceRecord(item), /must use security-privacy-data-loss-emergency class/);
});

test("emergency maintenance requires all three gates", () => {
  const item = record({
    change_class: "security-privacy-data-loss-emergency",
    product_behavior_changed: true,
    risk: { severity: "critical", data_loss_risk: true },
    affected_workflows: ["Export PDF content"],
    required_gates: {
      engineering_requalification: true,
      human_requalification: true,
      security_privacy_gate: true
    }
  });
  assert.deepEqual(requiredPolicy(item), item.required_gates);
  validateMaintenanceRecord(item);
});

test("qualified records cannot leave required gates unpassed", () => {
  const item = record({
    change_class: "product-hotfix",
    product_behavior_changed: true,
    affected_workflows: ["Edit PDF"],
    required_gates: { engineering_requalification: true, human_requalification: true },
    gate_results: { engineering_requalification: true, human_requalification: false },
    status: "qualified"
  });
  assert.throws(() => validateMaintenanceRecord(item), /human_requalification=true/);
});

test("privacy-sensitive evidence keys are rejected", () => {
  const item = record();
  item.password = "forbidden";
  assert.throws(() => validateMaintenanceRecord(item), /Privacy-sensitive field 'password' is forbidden/);
});
