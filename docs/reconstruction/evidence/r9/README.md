# R9/P43 Human + Real-Device Qualification Evidence

This directory stores privacy-safe evidence used to qualify the frozen post-P42 consumer product:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

Automation may validate, aggregate, hash, and certify real observations. It may never manufacture them.

## Evidence layers

### Full human sessions

Create with:

```bash
node scripts/reconstruction/r9_prepare_session.mjs ... --attest-physical-device yes
```

Follow `docs/reconstruction/r9-manual-session-runbook.md` and use the offline `r9-session-recorder.html`.

Completed files belong in:

`docs/reconstruction/evidence/r9/sessions/`

Recommended filename:

`session-YYYYMMDD-NN.json`

### Real-device journey runs

Create with:

```bash
node scripts/reconstruction/r9_prepare_device_run.mjs ... --attest-physical-device yes
```

Complete J01–J10 using `p43-real-device-run-template.json` and the P43 run contract.

Completed files belong in:

`docs/reconstruction/evidence/r9/device-runs/`

Recommended filename:

`device-YYYYMMDD-platform-NN.json`

## Physical-device requirement

Both evidence types must represent direct human observations on physical hardware. Qualifying evidence requires:

- `evidence_source = human-physical-device`;
- physical device true;
- simulator/emulator false;
- automation observation false;
- explicit human attestation true;
- exact OS/browser versions;
- structured device/browser/input/app metadata.

Do not set the physical-device attestation flag for browser emulation, simulators, remote CI, Playwright, Selenium, Puppeteer, AI agents, or synthetic sessions.

## What may be committed

- anonymous session/run/tester IDs;
- exact frozen qualification baseline;
- generic familiarity/PDF-experience categories;
- date;
- non-sensitive device class/model and exact OS/browser versions;
- input mode, viewport, and browser/PWA mode;
- corpus identifiers;
- randomized human measurement order;
- first-location, Help, interaction, completion, and prediction outcomes;
- J01–J10 result labels;
- concise non-sensitive defect descriptions.

## What must not be committed

- PDF/document bytes;
- private document contents, copied/extracted/OCR text;
- passwords or encryption secrets;
- personal names, emails, account identifiers, or other tester PII;
- device serial numbers or identifying hardware IDs;
- private/confidential filenames;
- screenshots containing confidential documents;
- base64/data-URL document or screenshot payloads.

## Human sample rule

`HUMAN_UX_TARGET_MET` requires:

- at least 3 valid physical-device sessions;
- at least 3 distinct anonymous tester IDs;
- at least 2 none/light-familiarity testers;
- each session >=90% on all three human metrics;
- aggregate >=90% on all three metrics;
- no unresolved critical/data-loss defect.

## Real-device matrix rule

`REAL_DEVICE_TARGET_MET` requires physical coverage for:

1. Windows desktop/laptop + Chromium;
2. macOS desktop/laptop + Safari;
3. Android phone + Chromium;
4. iPhone/iOS + Safari;
5. iPadOS tablet + Safari;

It also requires qualifying coverage for every J01–J10 journey and at least one installed-PWA run qualifying J10. Any measured `FAIL` prevents the target from being met.

## Campaign orchestration

P44 derives one campaign-level checklist from the actual evidence currently committed:

```bash
node scripts/reconstruction/p44_campaign_status.mjs
```

Use this command before fieldwork and after every committed human session or device run. It reports:

- remaining distinct human testers;
- remaining none/light-familiarity tester requirement;
- missing physical-device slots;
- missing J01–J10 journeys;
- installed-PWA J10 coverage;
- blocking defects or measured misses;
- whether the campaign is ready to certify;
- the next required actions.

The P44 campaign plan is `docs/reconstruction/p44-qualification-campaign-plan.json`. It contains requirements only and never pre-creates tester/device evidence.

## Validation

Human evidence:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs
```

Real-device evidence:

```bash
node scripts/reconstruction/r9_validate_real_device.mjs
```

Committed state ledger:

```bash
node scripts/reconstruction/r9_status_contract.mjs
```

Campaign progress:

```bash
node scripts/reconstruction/p44_campaign_status.mjs
```

## Certification

Only after both validators report target-met states:

```bash
node scripts/reconstruction/r9_certify_evidence.mjs \
  --out docs/reconstruction/evidence/r9/certification.json
```

The combined certificate records human metrics, real-device matrix/journey status, and SHA-256 digests for every human session and device run.

R10 independently requires the underlying files and verifies those digests. A hand-authored certificate without matching committed evidence cannot open operational readiness.

## Current state

At P43 framework merge time, there are no committed human session or real-device run files. Therefore the required honest state is:

- `HUMAN_UX_UNMEASURED`;
- `REAL_DEVICE_UNMEASURED`;
- `NOT_CERTIFIED`.

With those empty evidence directories, P44 derives `P44_CAMPAIGN_READY_FOR_FIELDWORK`. That state means the campaign can start; it is not a human-usability or real-device pass.

Do not create placeholders, AI-generated observations, browser-automation results, copied benchmark results, or fabricated physical-device metadata merely to change those states.
