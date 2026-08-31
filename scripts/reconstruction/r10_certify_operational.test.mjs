import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { buildOperationalCertification } from "./r10_certify_operational.mjs";

function hash(raw) {
  const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

test("operational certification refuses any non-ready gate state", () => {
  assert.throws(() => buildOperationalCertification({
    gateResult: { status: "R10_BLOCKED_BY_R9" },
    baselineRaw: "{}",
    r9CertificationRaw: "{}"
  }), /operational status is R10_BLOCKED_BY_R9/);
});

test("ready gate produces digest-backed operational certification with real-device status", () => {
  const baselineRaw = '{"schema":1,"product_baseline_commit":"abc"}';
  const r9Raw = '{"schema":1,"status":"R9_HUMAN_USABILITY_CERTIFIED"}';
  const maintenanceRaw = '{"change_id":"R10-MAINT-1","target_commit":"def","status":"qualified"}';
  const result = buildOperationalCertification({
    gateResult: {
      status: "R10_OPERATIONAL_READY",
      product_baseline_commit: "abc",
      r9_status: "R9_HUMAN_USABILITY_CERTIFIED",
      human_ux_status: "HUMAN_UX_TARGET_MET",
      real_device_status: "REAL_DEVICE_TARGET_MET"
    },
    baselineRaw,
    r9CertificationRaw: r9Raw,
    maintenanceEntries: [{
      raw: maintenanceRaw,
      record: { change_id: "R10-MAINT-1", target_commit: "def", status: "qualified" }
    }]
  });

  assert.equal(result.status, "R10_OPERATIONAL_CERTIFIED");
  assert.equal(result.real_device_status, "REAL_DEVICE_TARGET_MET");
  assert.equal(result.baseline_manifest_sha256, hash(baselineRaw));
  assert.equal(result.r9_certification_sha256, hash(r9Raw));
  assert.equal(result.maintenance.length, 1);
  assert.equal(result.maintenance[0].sha256, hash(maintenanceRaw));
});
