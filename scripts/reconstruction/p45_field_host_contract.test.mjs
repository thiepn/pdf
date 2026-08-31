import test from "node:test";
import assert from "node:assert/strict";
import { R9_BASELINE_SHA } from "./r9_validate_evidence.mjs";
import { validateFieldHost } from "./p45_field_host_contract.mjs";

const baseConfig = {
  schema: 1,
  phase: "P45",
  fieldwork_state: "OPEN_NO_EVIDENCE",
  active: true,
  stable_page_url: "https://thiepn.github.io/pdf/",
  stable_version: "7.0.0",
  stable_tag: "v7.0.0",
  stable_tag_commit: "cc630810c290e4b081fbec01e7e21b04893d9dba",
  product_baseline_commit: R9_BASELINE_SHA,
  qualification_path: "qualification/p42",
  qualification_url: "https://thiepn.github.io/pdf/qualification/p42/",
  root_preservation_contract: "live-release-integrity-byte-match",
  observation_policy: "human-physical-device-only"
};

function campaign(status) {
  return {
    status,
    human: { sessions: 0 },
    real_device: { runs: 0 },
    next_actions: ["Run real fieldwork."]
  };
}

test("empty campaign becomes P45 fieldwork ready, never certified", () => {
  const result = validateFieldHost(baseConfig, campaign("P44_CAMPAIGN_READY_FOR_FIELDWORK"));
  assert.equal(result.status, "P45_FIELDWORK_READY");
  assert.equal(result.active, true);
});

test("campaign state and fieldwork ledger must stay synchronized", () => {
  assert.throws(
    () => validateFieldHost(baseConfig, campaign("P44_CAMPAIGN_IN_PROGRESS")),
    /fieldwork_state must be IN_PROGRESS/
  );
});

test("qualification URL must be derived from the stable URL and isolated path", () => {
  assert.throws(
    () => validateFieldHost({ ...baseConfig, qualification_url: "https://example.com/" }, campaign("P44_CAMPAIGN_READY_FOR_FIELDWORK")),
    /qualification_url must equal stable_page_url \+ qualification_path/
  );
});

test("the root preservation contract cannot be weakened", () => {
  assert.throws(
    () => validateFieldHost({ ...baseConfig, root_preservation_contract: "best-effort" }, campaign("P44_CAMPAIGN_READY_FOR_FIELDWORK")),
    /root_preservation_contract must remain fail-closed/
  );
});

test("automation cannot become an observation source", () => {
  assert.throws(
    () => validateFieldHost({ ...baseConfig, observation_policy: "automation-allowed" }, campaign("P44_CAMPAIGN_READY_FOR_FIELDWORK")),
    /observation_policy must remain human-physical-device-only/
  );
});

test("certified campaign must deactivate the fieldwork host", () => {
  const config = { ...baseConfig, fieldwork_state: "CERTIFIED", active: false };
  const result = validateFieldHost(config, campaign("P44_CAMPAIGN_CERTIFIED"));
  assert.equal(result.status, "P45_FIELDWORK_CERTIFIED");
});
