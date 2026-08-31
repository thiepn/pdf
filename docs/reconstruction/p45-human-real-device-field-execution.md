# P45 — Human & Real-Device Field Qualification Execution

## Purpose

P45 executes the real human/device campaign defined by P43 and orchestrated by P44. It does not replace human observation with browser automation.

The frozen product under test is:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

The dedicated qualification host is:

`https://thiepn.github.io/pdf/qualification/p42/`

The normal Stable site remains:

`https://thiepn.github.io/pdf/`

P45 deploys the qualification build only when the rebuilt Stable root matches the live root `release-integrity.json` byte-for-byte. If that proof fails, Pages deployment stops before any content is replaced.

## Important browser/PWA isolation rule

The existing Stable service worker has `/pdf/` scope, which also contains the qualification subpath. Before a P45 device run:

1. close any installed Stable PDF Studio PWA;
2. clear site data/service workers for `thiepn.github.io` in the test browser, or use a fresh browser profile/device that has never opened `/pdf/`;
3. open the qualification URL directly;
4. do not visit the Stable root during the observation;
5. for installed-PWA J10, install from the qualification URL only and verify that the installed app reopens at `/pdf/qualification/p42/`.

This is test-environment hygiene, not a usability hint. It prevents the older root-scoped Stable service worker from controlling the first qualification navigation.

## Field campaign shape

P45 requires two evidence layers.

### Full human-usability sessions

Complete at least three full R9 sessions with three distinct people. At least two must have `none` or `light` prior PDF Studio familiarity.

A useful sample distribution is:

- one physical Windows Chromium desktop/laptop session;
- one physical macOS Safari desktop/laptop session;
- one physical Android Chromium phone session.

This distribution is recommended, not a substitute for the actual R9 metric gates.

### Real-device journey runs

Complete at least one physical run in each P43 slot:

- Windows + Chromium desktop/laptop;
- macOS + Safari desktop/laptop;
- Android + Chromium phone;
- iOS + Safari phone;
- iPadOS + Safari tablet.

Every J01–J10 journey must receive a qualifying result somewhere in the matrix, and J10 must qualify at least once in `installed-pwa` mode.

## Low-burden journey allocation

P43 does not require every device to repeat every journey. To keep fieldwork practical while still covering the matrix, use this default distribution unless a defect requires additional coverage:

| Device slot | Primary journeys |
| --- | --- |
| Windows Chromium desktop/laptop | J02, J04, J05, J06 |
| macOS Safari desktop/laptop | J01, J03, J09 |
| Android Chromium phone, installed PWA | J07, J10 |
| iOS Safari phone | J08 |
| iPadOS Safari tablet | J01, J03 |

All other journey entries remain `NOT_RUN` unless the tester actually performs them. Never mark unperformed work as PASS.

## Human-session execution

1. Generate the synthetic manual corpus using `r9_prepare_manual_corpus.py`.
2. Generate a schema-3 session with `r9_prepare_session.mjs` and real device metadata.
3. Keep `r9-session-recorder.html` visible only to the recorder/moderator.
4. Let the tester use the qualification host without hints.
5. Preserve every failed observation.
6. Export the completed JSON to `docs/reconstruction/evidence/r9/sessions/`.
7. Run `r9_validate_evidence.mjs` before committing.

Follow `r9-manual-session-runbook.md` exactly for D01–D20/C01–C10 scoring.

## Device-run execution

1. Generate the run with `r9_prepare_device_run.mjs` using real device metadata and `--attest-physical-device yes`.
2. Use only the qualification host and generated public/manual corpus.
3. Perform the journeys allocated to that device.
4. Record `PASS`, `PASS WITH EXPECTED LIMITATION`, `BLOCKED CORRECTLY`, `FAIL`, or `NOT_RUN` exactly as observed.
5. Preserve defects and failed results.
6. Save the run under `docs/reconstruction/evidence/r9/device-runs/`.
7. Run `r9_validate_real_device.mjs` before committing.

## After every evidence contribution

Run:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs
node scripts/reconstruction/r9_validate_real_device.mjs
node scripts/reconstruction/r9_status_contract.mjs
node scripts/reconstruction/p44_campaign_status.mjs
node scripts/reconstruction/p45_field_host_contract.mjs
```

The P45 field-host ledger must be updated to match the derived P44 campaign state:

- `OPEN_NO_EVIDENCE` → `P44_CAMPAIGN_READY_FOR_FIELDWORK`;
- `IN_PROGRESS` → `P44_CAMPAIGN_IN_PROGRESS`;
- `BLOCKED` → `P44_CAMPAIGN_BLOCKED`;
- `READY_TO_CERTIFY` → `P44_CAMPAIGN_READY_TO_CERTIFY`;
- `CERTIFIED` → `P44_CAMPAIGN_CERTIFIED`.

Do not edit evidence to make the ledger pass. The ledger follows evidence, never the reverse.

## When a defect appears

If a human session or device run finds a product defect:

1. commit the failed evidence unchanged;
2. mark P45 `BLOCKED` when the P44 status requires it;
3. fix the defect in a separate narrowly scoped maintenance phase;
4. re-freeze the product baseline if consumer behavior changes;
5. rerun only the affected observations as new evidence files.

Never overwrite the failed observation with the retry.

## Certification

Only when P44 reports `P44_CAMPAIGN_READY_TO_CERTIFY`:

```bash
node scripts/reconstruction/r9_certify_evidence.mjs \
  --out docs/reconstruction/evidence/r9/certification.json
```

Commit the certificate and change `field-host.json` to:

- `fieldwork_state = CERTIFIED`;
- `active = false`.

Then run the P45 contract again. Only `P45_FIELDWORK_CERTIFIED` closes field execution.

## Current honest state

At P45 launch there are no committed human sessions or device runs. Therefore:

- P44: `P44_CAMPAIGN_READY_FOR_FIELDWORK`;
- P45: `P45_FIELDWORK_READY`;
- R9 human UX: `HUMAN_UX_UNMEASURED`;
- real-device: `REAL_DEVICE_UNMEASURED`;
- certification: `NOT_CERTIFIED`.

P45 is **launched** when the HTTPS qualification host is live and all release gates pass. P45 is **completed** only after real evidence reaches `P45_FIELDWORK_CERTIFIED`.
