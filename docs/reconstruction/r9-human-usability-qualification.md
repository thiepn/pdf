# R9 — Human Usability Qualification & Physical-Device Validation

## 1. Purpose

R9 measures PDF Studio usability using real people. P43 hardens R9 so qualifying sessions must also be conducted on physical consumer hardware.

Authoritative human/device qualification baseline:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

This is the post-P42 consumer UI baseline. The previous R8 operational baseline remains separate until the human/device evidence is complete and R10 formally promotes the newer baseline.

Targets remain:

1. top-20 first-location accuracy >=90%;
2. top-10 completion without Help >=90%;
3. navigation-prediction accuracy >=90%.

Automation may validate evidence, calculate metrics, enforce privacy, and verify hashes. AI agents, browser automation, emulators, simulators, synthetic users, and CI runners must never be counted as the observations themselves.

## 2. Freeze policy

R9/P43 does not reopen feature expansion. Evidence tooling and documentation can evolve without changing the consumer baseline. If real testing exposes a product defect, preserve the failed evidence, fix only the defect, fully requalify the corrected product commit, re-freeze the qualification baseline, and rerun affected observations.

Do not silently move evidence between product baselines.

## 3. Human qualification population

A certification sample requires at least **three distinct human testers**. At least **two** qualifying testers must have `none` or `light` prior familiarity with PDF Studio.

Use anonymous tester IDs only. Repeated sessions from one tester may be retained but do not increase the distinct-tester sample.

Each full human session records:

- `familiarity`: `none`, `light`, or `experienced`;
- `pdf_experience`: `basic`, `regular`, or `advanced`;
- structured physical-device environment metadata required by schema 3.

## 4. Physical-device requirement

Every human session must have:

- `evidence_source = human-physical-device`;
- `physical_device = true`;
- `simulator_or_emulator = false`;
- `automation_used_for_observation = false`;
- `human_attestation = true`;
- exact OS/browser versions;
- structured device class, OS/browser family, input mode, viewport, and app mode;
- `build_channel = p42-frozen-consumer-baseline`.

The validator rejects simulator/emulator/Playwright/Puppeteer/Selenium/CI markers and forbids device serial numbers or identifying hardware IDs.

## 5. Frozen discovery set

| ID | Intent | Canonical destination |
| --- | --- | --- |
| D01 | Edit text | Edit PDF |
| D02 | Add text | Edit PDF |
| D03 | Replace image | Edit PDF |
| D04 | Highlight | Annotate & comment |
| D05 | Sign visually | Add visual signature |
| D06 | Redact permanently | Apply permanent redactions |
| D07 | Merge | Merge PDFs |
| D08 | Split | Split PDF |
| D09 | Extract pages | Organize pages |
| D10 | Delete pages | Organize pages |
| D11 | Reorder pages | Organize pages |
| D12 | Rotate pages | Organize pages |
| D13 | Crop | Crop pages |
| D14 | Compress | Compress PDF |
| D15 | OCR | OCR PDF |
| D16 | Remove metadata | Edit or remove metadata |
| D17 | Password-protect | Password-protect PDF |
| D18 | Fill form | Fill PDF forms |
| D19 | Images to PDF | Scan to PDF |
| D20 | PDF pages to images | Export PDF content |

For each item, record the tester's predicted location before navigation, then record the first deliberate location chosen before any Help or task-specific assistance.

A first location is correct only when it is the canonical location or a qualified shortcut that routes directly to the same workflow.

Individual-session and aggregate target: **18/20 or better**.

## 6. Frozen no-Help completion set

| ID | Workflow | Measured during |
| --- | --- | --- |
| C01 | Edit existing text | D01 |
| C02 | Highlight text | D04 |
| C03 | Sign visually | D05 |
| C04 | Permanently redact | D06 |
| C05 | Merge PDFs | D07 |
| C06 | Delete/reorder pages | D10 |
| C07 | Compress PDF | D14 |
| C08 | OCR scan | D15 |
| C09 | Fill form | D18 |
| C10 | Images to PDF | D19 |

Completion is measured during the same first exposure as the mapped discovery item. A workflow counts only when the intended valid result is reached without opening Help or receiving task-specific coaching.

Individual-session and aggregate target: **9/10 or better**.

## 7. Navigation prediction

Before each D01–D20 item, ask where the tester expects the task to live and record that answer before revealing the canonical destination or allowing navigation.

Individual-session and aggregate target: **18/20 or better**.

## 8. Learning-bias control

Each session uses a deterministic shuffled `measurement_order` containing D01–D20 exactly once. The canonical sorted order is rejected.

Rules:

- do not show canonical destinations to the tester;
- read only the neutral task prompt;
- capture prediction first;
- capture first navigation choice second;
- continue directly to mapped no-Help completion third;
- do not coach, hint, point, or expose prior results;
- do not restart a failed item to convert it into a pass.

## 9. Human session validity

A full session is valid only when:

- schema is 3;
- `baseline_commit` equals the exact post-P42 qualification baseline;
- physical-device/human attestation is complete;
- tester profile is complete;
- measurement order is complete, unique, and shuffled;
- D01–D20 first-location evidence is complete;
- C01–C10 completion evidence is complete;
- D01–D20 navigation prediction evidence is complete;
- values are direct completed human observations rather than inferred or synthesized data;
- privacy rules pass;
- defects are recorded.

## 10. Real-device matrix layer

R9 certification now also requires the P43 real-device layer. Full human sessions measure usability metrics; device runs prove representative journeys on the required hardware/browser matrix.

Required slots:

1. Windows desktop/laptop + Chromium-family browser;
2. macOS desktop/laptop + Safari;
3. Android physical phone + Chromium-family browser;
4. iPhone/iOS + Safari;
5. iPadOS tablet + Safari.

Required J01–J10 journeys and detailed result rules are defined in `p43-real-device-human-evidence.md` and `p43-real-device-run-template.json`.

At least one installed-PWA run must qualify J10.

## 11. Evidence locations

Full human sessions:

`docs/reconstruction/evidence/r9/sessions/`

Real-device runs:

`docs/reconstruction/evidence/r9/device-runs/`

Generate files through the repository scripts rather than hand-copying templates. The generators fill metadata and randomized order only; they never synthesize observations.

## 12. Metric and sample gate

For `N` valid human sessions:

- `first_location_accuracy = correct first locations / 20N`;
- `no_help_completion = completed without Help / 10N`;
- `navigation_prediction_accuracy = matching predictions / 20N`.

`HUMAN_UX_TARGET_MET` requires every individual session and aggregate metrics to pass, at least 3 distinct testers, and at least 2 none/light-familiarity testers.

The real-device layer is independently summarized as `REAL_DEVICE_*` and must reach `REAL_DEVICE_TARGET_MET`.

## 13. Defect policy

An unresolved defect blocks certification when either:

- severity is `critical`; or
- category is `data-loss`.

High/medium/low usability findings remain evidence and may justify a later maintenance fix but do not automatically invalidate otherwise measured metrics.

## 14. Certification vocabulary

Human layer:

- `HUMAN_UX_UNMEASURED`
- `HUMAN_UX_SAMPLE_INSUFFICIENT`
- `HUMAN_UX_TARGET_MET`
- `HUMAN_UX_TARGET_MISSED`
- `R9_BLOCKED_BY_PRODUCT_DEFECT`

Real-device layer:

- `REAL_DEVICE_UNMEASURED`
- `REAL_DEVICE_MATRIX_INCOMPLETE`
- `REAL_DEVICE_TARGET_MET`
- `REAL_DEVICE_TARGET_MISSED`
- `REAL_DEVICE_BLOCKED_BY_PRODUCT_DEFECT`

`R9_HUMAN_USABILITY_CERTIFIED` can be emitted only when both `HUMAN_UX_TARGET_MET` and `REAL_DEVICE_TARGET_MET` are true.

## 15. Evidence integrity

The R9 certifier records SHA-256 digests for every committed human session and device run. R10 refuses operational readiness unless the underlying evidence files are present and every digest matches.

A hand-authored certificate without the committed evidence cannot open R10.

## 16. Current state

Until physical human evidence exists, the required state is:

- `HUMAN_UX_UNMEASURED`;
- `REAL_DEVICE_UNMEASURED`;
- `NOT_CERTIFIED`.

The state is committed in `docs/reconstruction/evidence/r9/status.json` and checked against the actual evidence directories by `r9_status_contract.mjs`.

## 17. Execution sequence

1. Generate the privacy-safe manual corpus.
2. Serve/build the exact post-P42 qualification baseline.
3. Generate a schema-3 session file for each human tester with physical-device attestation.
4. Conduct and export the 20-item sessions using the offline recorder.
5. Validate each human session.
6. Generate and conduct real-device J01–J10 runs until the five-slot matrix and installed-PWA requirement are covered.
7. Validate device runs and triage defects.
8. Update the committed qualification status to match measured evidence.
9. Run aggregate validators.
10. Generate the combined R9 certificate only when both layers pass.
11. Follow the documented R10 baseline-promotion process before claiming operational readiness for the newer consumer baseline.
