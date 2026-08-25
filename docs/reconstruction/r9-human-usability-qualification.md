# R9 — Human Usability Qualification & Post-Freeze Validation

## 1. Purpose

R9 measures the human usability claims that R8 intentionally left `HUMAN_UX_UNMEASURED` while preserving the frozen reconstructed product.

Authoritative product baseline:

`7c81f95815a3d8740fddef3d76e264ebb19c96f8`

Targets:

1. top-20 first-location accuracy >=90%;
2. top-10 completion without Help >=90%;
3. navigation prediction accuracy >=90%.

Automation may validate evidence structure and calculate metrics. Automation, AI agents, browser tests, synthetic users, or structural search proxies must never be counted as the human evidence itself.

## 2. Freeze policy

R9 does not reopen feature expansion. R9 changes are limited to qualification protocol, evidence tooling, metric calculation, and narrowly scoped maintenance defects exposed by real sessions.

If a real session exposes a product-code defect, the corrected exact head must pass the full R8 engineering gate before affected human observations are rerun.

The manual session must exercise the exact frozen R8 product baseline. R9 evidence/tooling commits do not replace that baseline merely because they leave product behavior unchanged.

## 3. Human qualification population

A certification sample requires **at least three distinct human testers**.

To reduce owner/expert bias, at least **two of the three qualifying testers must have `none` or `light` prior familiarity** with PDF Studio. Additional testers are encouraged.

Repository evidence uses non-sensitive tester IDs only. Do not store names, emails, private filenames, document contents, passwords, OCR text, screenshots of confidential documents, or document bytes.

Each session records:

- `tester_id` — anonymous local identifier;
- `familiarity` — `none`, `light`, or `experienced`;
- `pdf_experience` — `basic`, `regular`, or `advanced`.

Repeated sessions from the same tester may be retained for research, but they do not increase the distinct-tester certification sample size.

## 4. Frozen task sets

### 4.1 Top-20 first-location set

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

For each intent, record the tester's **predicted location before navigation**, then allow navigation and record the **first actual location chosen** before any Help or task-specific assistance.

`correct_first_location=true` only when the first chosen location is the canonical location or an explicitly qualified shortcut routing directly to the same workflow.

Target: **18/20 or better in every qualifying session**, and >=90% in aggregate.

### 4.2 Top-10 no-Help completion set

| ID | Workflow | Measured during discovery item |
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

These completion outcomes are measured **during the same first exposure** as the corresponding discovery item. After recording prediction and first location, the tester continues the task without Help. Do not repeat the workflow later merely to obtain the completion metric.

A task counts as completed without Help only when the intended valid result is reached without opening Help or receiving task-specific navigation/instruction assistance.

Target: **9/10 or better in every qualifying session**, and >=90% in aggregate.

### 4.3 Navigation prediction

Before each D01-D20 intent is navigated, ask where the tester expects the task to live. Record the answer before revealing the interface route or canonical destination.

`matches_canonical=true` only when the prediction names the canonical destination or a qualified equivalent entry point that routes directly to it.

Target: **18/20 or better in every qualifying session**, and >=90% in aggregate.

## 5. Learning-bias control

A fixed task order can inflate later scores as the tester learns the information architecture. Therefore each session includes a `measurement_order` containing D01-D20 exactly once in a shuffled order.

The session generator derives a deterministic shuffle from the session ID so the order is reproducible but differs across session IDs.

Rules:

- do not show the canonical-destination table to the tester before or during the session;
- read only the neutral task prompt for the current item;
- ask for prediction first;
- allow the first navigation choice second;
- for the mapped top-10 items, continue directly to no-Help completion third;
- do not coach, hint, point, or expose a previous tester's result;
- do not restart a failed item to convert it into a pass.

## 6. Session validity

A session is valid only when:

- schema is current;
- `baseline_commit` is exactly the frozen R8 baseline;
- tester profile and environment metadata are complete;
- `measurement_order` contains every D01-D20 ID exactly once and is not the canonical sorted order;
- all D01-D20 first-location observations are present exactly once;
- all C01-C10 no-Help outcomes are present exactly once;
- all D01-D20 navigation predictions are present exactly once;
- all measured values are real completed human observations, not null, inferred, synthesized, or copied from automation;
- privacy rules are satisfied;
- observed defects are recorded.

Incomplete sessions may be retained outside certification evidence but must not enter certification denominators.

## 7. Evidence files

Create sessions with `scripts/reconstruction/r9_prepare_session.mjs` rather than hand-copying the template. Completed evidence belongs under:

`docs/reconstruction/evidence/r9/sessions/`

Recommended filename:

`session-YYYYMMDD-NN.json`

The validator rejects wrong-baseline sessions, incomplete or duplicate IDs, invalid measurement order, malformed values, and privacy-sensitive fields.

## 8. Metric calculation

For `N` valid sessions:

`first_location_accuracy = correct first locations / 20N`

`no_help_completion = completed without Help / 10N`

`navigation_prediction_accuracy = matching predictions / 20N`

A qualifying certification requires both:

- every individual session reaches the 90% threshold on all three metrics; and
- aggregate evidence reaches the 90% threshold on all three metrics.

This prevents a strong tester from hiding a clearly unsuccessful tester in the aggregate.

## 9. Sample-size gate

`HUMAN_UX_TARGET_MET` requires:

- at least 3 valid sessions;
- at least 3 distinct `tester_id` values;
- at least 2 distinct testers with `familiarity` equal to `none` or `light`.

Valid evidence below that sample remains useful, but its state is `HUMAN_UX_SAMPLE_INSUFFICIENT` unless a measured target has already been missed.

## 10. Defect policy

A defect blocks certification if unresolved and either:

- severity is `critical`; or
- category is `data-loss`.

When such a defect appears:

1. preserve the session evidence;
2. open a narrowly scoped maintenance defect;
3. fix only the defect;
4. rerun the full R8 engineering qualification on the corrected exact head;
5. establish that corrected commit as the new maintenance baseline;
6. rerun affected human observations.

High/medium/low usability defects may justify maintenance but do not automatically block metric calculation.

## 11. Certification vocabulary

- `HUMAN_UX_UNMEASURED` — no complete valid human session exists.
- `HUMAN_UX_SAMPLE_INSUFFICIENT` — valid sessions exist and currently meet measured targets, but the minimum distinct-tester sample is not yet satisfied.
- `HUMAN_UX_TARGET_MET` — sample gate passes, every individual session passes all three targets, aggregate metrics pass all three targets, and no blocking defect remains.
- `HUMAN_UX_TARGET_MISSED` — valid human evidence exists and at least one individual or aggregate target is below 90%.
- `R9_BLOCKED_BY_PRODUCT_DEFECT` — an unresolved critical/data-loss defect prevents certification.

Only `HUMAN_UX_TARGET_MET` closes R9.

## 12. R9 execution sequence

1. Generate privacy-safe manual corpus assets.
2. Launch the exact R8 baseline build.
3. Generate one randomized session evidence file per human tester.
4. Conduct the 20-item session using the neutral prompt runbook.
5. Validate each completed evidence file immediately.
6. Record and triage any observed defects.
7. Continue until the minimum distinct-tester sample is reached.
8. Run aggregate validation.
9. If `HUMAN_UX_TARGET_MET`, freeze R9 evidence and close the phase. If not, follow the measured defect/usability findings rather than inventing new features.
