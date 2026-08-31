# P44 — Qualification Campaign Orchestrator

## Purpose

P44 turns the P43 human/real-device evidence framework into an executable field campaign without manufacturing evidence.

P43 already defines what qualifies. P44 answers the operational question: **what is still missing right now, and what should the field operator do next?**

The orchestrator reads the actual committed R9 human-session and real-device-run directories and derives campaign progress. It does not create observations, score unmeasured outcomes, invent tester identities, or write certification evidence.

## Frozen product baseline

All P44 fieldwork remains tied to the P43/R9 consumer qualification baseline:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

The product UI must not change during the campaign. Any product-code defect found by a real tester follows the P43/R9 defect policy: preserve the evidence, qualify the fix separately, re-freeze the candidate, and rerun affected observations.

## Campaign plan

`docs/reconstruction/p44-qualification-campaign-plan.json` is the machine-readable campaign contract.

It freezes:

- 3 distinct full human testers minimum;
- at least 2 testers with `none` or `light` prior PDF Studio familiarity;
- 90% individual and aggregate human metric targets;
- the 5 required physical-device/browser slots;
- J01–J10 real-device journey coverage;
- installed-PWA J10 recovery coverage;
- the requirement that both human and real-device targets pass before R9 certification;
- the prohibition on automated or placeholder observations.

The plan contains **requirements only**. It intentionally does not contain names, tester IDs, device IDs, or pre-generated evidence records.

## Status engine

Run:

```bash
node scripts/reconstruction/p44_campaign_status.mjs
```

The engine validates the campaign plan, loads real evidence from:

- `docs/reconstruction/evidence/r9/sessions/`
- `docs/reconstruction/evidence/r9/device-runs/`

and checks for:

- missing distinct human testers;
- missing low-familiarity testers;
- current human metrics/status;
- missing physical-device slots;
- missing J01–J10 journeys;
- missing installed-PWA recovery coverage;
- human/device blocking defects;
- measured target misses;
- presence and basic validity of the combined R9 certification.

It then emits a deterministic `next_actions` list.

## Campaign states

### `P44_CAMPAIGN_READY_FOR_FIELDWORK`

No human or real-device evidence exists yet. The framework is valid and fieldwork can begin.

### `P44_CAMPAIGN_IN_PROGRESS`

Some qualifying evidence exists, but the human sample, device matrix, journey matrix, or installed-PWA recovery requirement is incomplete.

### `P44_CAMPAIGN_BLOCKED`

A human/device target has been missed, a blocking defect exists, or an inconsistent/invalid certification record is present.

Failed evidence must be preserved. Do not delete or overwrite failed observations to return the campaign to green.

### `P44_CAMPAIGN_READY_TO_CERTIFY`

Both `HUMAN_UX_TARGET_MET` and `REAL_DEVICE_TARGET_MET` are satisfied, but the digest-backed R9 certification has not yet been generated.

Next action:

```bash
node scripts/reconstruction/r9_certify_evidence.mjs \
  --out docs/reconstruction/evidence/r9/certification.json
```

### `P44_CAMPAIGN_CERTIFIED`

The combined R9 human + real-device certificate exists and matches the frozen P42 consumer baseline.

P44 then hands off to the separately qualified R10 baseline-promotion step described by P43. P44 itself does not promote the operational baseline.

## Recommended field sequence

1. Run `p44_campaign_status.mjs` and keep the output as the campaign checklist.
2. Recruit at least three distinct testers; at least two should have none/light PDF Studio familiarity.
3. Generate each full session only when the real tester/device/browser metadata is known with `r9_prepare_session.mjs`.
4. Conduct each full session with `r9-session-recorder.html` and validate immediately.
5. Generate physical device runs only when the actual device/browser metadata is known with `r9_prepare_device_run.mjs`.
6. Cover the five required platform slots and J01–J10 across those runs.
7. Ensure J10 succeeds at least once in installed-PWA mode.
8. Re-run `p44_campaign_status.mjs` after every committed observation.
9. If blocked, preserve evidence and address the measured finding rather than coaching around it.
10. When the campaign reports `P44_CAMPAIGN_READY_TO_CERTIFY`, generate the combined R9 certificate.
11. Only after `P44_CAMPAIGN_CERTIFIED` begin the R10 product-baseline promotion.

## Evidence honesty boundary

P44 does not make the real-device/human gap disappear. It makes the remaining work explicit.

The following still do **not** count as evidence:

- Playwright or browser emulation;
- Chrome/Safari responsive-mode simulations;
- CI runners;
- AI agents;
- synthetic user behavior;
- generated PASS values;
- placeholder tester/device records.

Only completed human observations on physical devices can advance the campaign.

## Current expected state

Immediately after P44 implementation, with the P43 evidence directories still empty, the expected derived state is:

`P44_CAMPAIGN_READY_FOR_FIELDWORK`

This is not a usability certification. It means only that the campaign framework is internally consistent and ready for actual field execution.
