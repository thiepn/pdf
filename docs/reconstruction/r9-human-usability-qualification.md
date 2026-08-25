# R9 — Human Usability Qualification & Post-Freeze Validation

## 1. Purpose

R9 begins from the frozen R8 reconstruction baseline:

`7c81f95815a3d8740fddef3d76e264ebb19c96f8`

R8 established engineering reliability and froze the reconstructed product. R9 does not reopen feature expansion. Its purpose is to measure the three human usability claims that R8 intentionally left `HUMAN_UX_UNMEASURED`:

1. top-20 first-location accuracy >=90%;
2. top-10 completion without Help >=90%;
3. navigation prediction accuracy >=90%.

Automation may validate evidence structure and calculate these metrics. Automation, AI agents, browser tests, synthetic users, or structural search proxies must never be counted as the human evidence itself.

## 2. Baseline and freeze policy

The authoritative R9 baseline is the exact frozen R8 `main` commit above.

R9 changes should be limited to:

- qualification protocol and evidence templates;
- privacy-safe evidence validation;
- metric calculation and certification reporting;
- narrowly scoped maintenance defects exposed by real sessions.

A product-code change discovered during R9 invalidates the old usability baseline for affected workflows. That change must:

1. be isolated to the observed defect;
2. pass the full R8 engineering gate on its new exact head;
3. become the new frozen maintenance baseline before affected R9 sessions resume.

R9 is not a reason to add new PDF capability or redesign the product without observed evidence.

## 3. Human qualification population

A qualifying session is performed by a real person interacting with the frozen build. The tester may be the product owner or another person; identity is not required in repository evidence.

Evidence should use a non-sensitive tester/session identifier. Do not store names, email addresses, private document names, document contents, passwords, OCR text, screenshots of confidential documents, or document bytes.

## 4. Frozen task sets

### 4.1 Top-20 first-location set

The R8/R0 discoverability set remains frozen:

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

**Measurement:** before receiving navigation help, record the tester's first chosen location. `correct_first_location=true` only when the first chosen location is the canonical location or an explicitly qualified shortcut that routes directly to the same canonical workflow.

**Target:** at least 18/20 correct per complete session, and >=90% across the qualifying evidence set.

### 4.2 Top-10 no-Help completion set

| ID | Workflow |
| --- | --- |
| C01 | Edit existing text |
| C02 | Highlight text |
| C03 | Sign visually |
| C04 | Permanently redact |
| C05 | Merge PDFs |
| C06 | Delete/reorder pages |
| C07 | Compress PDF |
| C08 | OCR scan |
| C09 | Fill form |
| C10 | Images to PDF |

A task counts as completed without Help only when the tester reaches the intended valid result without opening Help or receiving task-specific navigation/instruction assistance.

A correctly capability-gated unsupported document does not count as a product failure, but the session should use a supported representative document when the metric is intended to measure completion rather than boundary comprehension.

**Target:** at least 9/10 per complete session, and >=90% across the qualifying evidence set.

### 4.3 Navigation prediction set

Before navigating for each D01-D20 intent, ask the tester where they expect the task to live. Record the predicted location before the interface route is revealed or task-specific assistance is provided.

`matches_canonical=true` when the prediction names the canonical destination or an explicitly qualified equivalent entry point that routes to it.

**Target:** at least 18/20 per complete session, and >=90% across the qualifying evidence set.

## 5. Session validity

A session is qualifying only when all of the following are true:

- it records the exact R9 baseline commit;
- all D01-D20 first-location observations are present exactly once;
- all C01-C10 no-Help outcomes are present exactly once;
- all D01-D20 navigation predictions are present exactly once;
- each measured outcome is a real boolean observation, not inferred or synthesized;
- environment metadata is present;
- evidence obeys the privacy rules;
- any observed product defect is recorded.

Incomplete sessions may be retained outside certification evidence for research notes, but they must not enter the denominator of certification metrics.

## 6. Evidence file contract

Start each session from `r9-session-template.json` and save completed evidence under:

`docs/reconstruction/evidence/r9/sessions/`

Recommended filename:

`session-YYYYMMDD-NN.json`

The filename is an evidence identifier only. Do not include tester names or private document names.

The validator rejects:

- a baseline commit different from the R9 baseline;
- missing/duplicate/unknown task IDs;
- non-boolean measured outcomes;
- incomplete frozen task sets;
- forbidden privacy-sensitive fields;
- malformed defect records.

## 7. Metric calculation

For one or more valid sessions:

`first_location_accuracy = correct first locations / 20N`

`no_help_completion = completed without Help / 10N`

`navigation_prediction_accuracy = matching predictions / 20N`

where `N` is the number of qualifying sessions.

The validator reports counts as well as percentages so a rounded percentage cannot hide a failed threshold.

## 8. Defect policy

Observed defects are classified separately from metric outcomes.

A defect blocks R9 certification if it is unresolved and either:

- severity is `critical`; or
- category is `data-loss`.

When such a defect appears:

1. preserve the session evidence;
2. open a narrowly scoped maintenance defect;
3. fix only the defect;
4. rerun the full R8 engineering qualification on the corrected exact head;
5. establish that corrected commit as the new maintenance baseline;
6. rerun affected human observations before certification.

High/medium/low usability defects may still justify maintenance, but do not automatically block the human metric calculation.

## 9. Certification vocabulary

- `HUMAN_UX_UNMEASURED` — no complete valid human session is supplied.
- `HUMAN_UX_TARGET_MET` — all three aggregate metrics are >=90% and no unresolved blocking defect exists.
- `HUMAN_UX_TARGET_MISSED` — complete valid human evidence exists and at least one metric is below 90%.
- `R9_BLOCKED_BY_PRODUCT_DEFECT` — metrics may be calculable, but an unresolved critical/data-loss defect prevents certification.

Only `HUMAN_UX_TARGET_MET` closes the R9 usability target.

## 10. Initial R9 acceptance criteria

R9 foundation is ready for manual sessions when:

- this protocol is committed from the frozen R8 baseline;
- the session template contains all frozen observations;
- the evidence validator rejects incomplete, wrong-baseline, duplicate, malformed, and privacy-unsafe evidence;
- validator tests pass;
- no R9 foundation change alters PDF product behavior.

R9 itself is complete only after qualifying real-human evidence has been collected, validated, and classified under the vocabulary above.
