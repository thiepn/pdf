# P43 — Real-Device Consumer Journey Qualification & Human Usability Evidence

## Purpose

P43 closes the gap between automated browser qualification and evidence from people using PDF Studio on physical consumer hardware.

P43 does **not** treat Playwright, device emulation, simulators, AI agents, CI runners, screenshots, or synthetic observations as human or real-device evidence. Automation may validate evidence structure, privacy, hashes, coverage, and metrics only.

## Frozen qualification baseline

The consumer product being measured is the exact post-P42 commit:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

This is recorded in `docs/reconstruction/evidence/r9/qualification-baseline.json` and is the only valid `baseline_commit` for P43/R9 evidence.

P43 itself changes qualification tooling and documentation only. It does not change PDF Studio consumer behavior.

The previous R8 operational baseline remains separately recorded as:

`7c81f95815a3d8740fddef3d76e264ebb19c96f8`

That older commit must not be used for new human testing because P36–P42 changed the consumer interface that people actually see.

## Two evidence layers

### 1. Full human-usability sessions

The existing R9 study remains the source of the three primary usability metrics:

- 20 first-location observations;
- 10 no-Help completion outcomes;
- 20 navigation predictions.

Certification still requires at least three distinct human testers, at least two with `none` or `light` familiarity, every qualifying session at or above 90% on all three metrics, and aggregate metrics at or above 90%.

P43 upgrades these sessions to schema 3 and requires every one to be conducted on a physical device with explicit human attestation.

### 2. Real-device journey runs

A lighter device-run record verifies representative end-to-end journeys across the required physical hardware/browser matrix. These runs do not replace the full human study and do not create its metrics.

The same person may contribute more than one device run. Real-device coverage is a platform matrix, not an additional distinct-tester requirement.

## Physical-device evidence contract

Every human session and device run must record:

- `evidence_source = human-physical-device`;
- `physical_device = true`;
- `simulator_or_emulator = false`;
- `automation_used_for_observation = false`;
- `human_attestation = true`;
- device class and non-sensitive device model;
- OS family and exact OS version;
- browser family, browser name, and exact browser version;
- input mode;
- viewport as `WIDTHxHEIGHT`;
- browser or installed-PWA app mode;
- build channel `p42-frozen-consumer-baseline`.

Evidence containing simulator/emulator/Playwright/Puppeteer/Selenium/CI markers is rejected. Device serial numbers and other identifying hardware IDs are forbidden.

## Required real-device matrix

P43 requires at least one qualifying run in every slot:

| Slot | Physical environment | Input |
| --- | --- | --- |
| Windows Chromium desktop | Windows desktop/laptop, Chromium-family browser | keyboard + mouse/trackpad |
| macOS Safari desktop | macOS desktop/laptop, Safari/WebKit | keyboard + mouse/trackpad |
| Android Chromium phone | Android physical phone, Chromium-family browser | touch |
| iOS Safari phone | physical iPhone/iOS, Safari/WebKit | touch |
| iPadOS Safari tablet | physical iPad/iPadOS, Safari/WebKit | touch |

Browser emulation of any slot does not count.

## Required real-device journeys

Every J01–J10 journey must have at least one qualifying physical-device result somewhere in the matrix.

| ID | Journey |
| --- | --- |
| J01 | Open a PDF, read it, search text, and navigate pages |
| J02 | Edit existing text, save locally, leave the editor, and reopen |
| J03 | Add an annotation/object and use undo/redo |
| J04 | Delete or reorder pages and export the result |
| J05 | Merge or split PDFs and open the output |
| J06 | Compress a PDF and reopen the compressed output |
| J07 | OCR a scan and search the recognized result |
| J08 | Exercise a protected/permanent-change workflow and verify original-file safety |
| J09 | Find an advanced/specialist tool through disclosure or search and enter the correct workflow |
| J10 | Recover local work after reload and verify installed-PWA/offline reopening where supported |

`PASS` and `PASS WITH EXPECTED LIMITATION` cover a journey. `BLOCKED CORRECTLY` documents an honest product boundary but does not by itself count as successful journey coverage. `FAIL` prevents `REAL_DEVICE_TARGET_MET`. `NOT_RUN` is allowed only while collecting evidence.

At least one installed-PWA run must pass J10.

## Defects

Unresolved critical defects or any unresolved data-loss defect block both human certification and real-device qualification. Lower-severity findings remain visible evidence and may trigger a narrowly scoped maintenance phase.

Do not overwrite a failed observation with a retry. Preserve the evidence, fix the defect on a separately qualified commit if necessary, re-freeze the candidate, and rerun affected observations.

## Privacy

Evidence must remain repository-safe. Do not commit:

- names, emails, passwords, account identifiers, device serial numbers;
- private filenames;
- PDF bytes or extracted/OCR text;
- screenshots of confidential material;
- personal document contents.

Use anonymous tester IDs and the generated public/manual corpus only.

## Certification

`r9_certify_evidence.mjs` can emit `R9_HUMAN_USABILITY_CERTIFIED` only when both conditions are true:

1. `HUMAN_UX_TARGET_MET`;
2. `REAL_DEVICE_TARGET_MET`.

The certification contains SHA-256 digests for every committed human session and every committed device run. R10 independently requires the underlying files and verifies those hashes before it can become operationally ready.

## R10 baseline promotion

P43 intentionally does not rewrite the current R10 operational baseline merely because the newer UI has automated qualification.

After human and real-device evidence certifies the P42 baseline:

1. preserve the P43/R9 certification and evidence;
2. record a qualified R10 product-baseline promotion from the old R8 baseline to the P42 baseline;
3. mark engineering requalification and human requalification as passed on that maintenance record;
4. update `docs/reconstruction/evidence/r10/current-product-baseline.json` to the P42 commit and reference that qualified maintenance change;
5. rerun the R10 gate and only then issue operational certification.

This prevents either automated CI or a documentation-only commit from promoting a consumer product baseline before human evidence exists.

## Current state

At P43 framework merge time, no human session or real-device run has been committed. Therefore the only honest state is:

- `HUMAN_UX_UNMEASURED`;
- `REAL_DEVICE_UNMEASURED`;
- `NOT_CERTIFIED`.

`docs/reconstruction/evidence/r9/status.json` records this state, and `r9_status_contract.mjs` makes CI fail if the committed state disagrees with the actual evidence directories.

## Exit condition

P43 framework implementation is complete when the evidence tooling, physical-device validators, combined certifier, R10 enforcement, status contract, documentation, and automated contract tests are merged and green.

**P43 real-device/human qualification itself is not complete until real humans conduct and commit the required physical-device evidence.**
