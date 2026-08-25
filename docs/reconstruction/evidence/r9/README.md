# R9 Human Qualification Evidence

This directory is reserved for privacy-safe evidence from real-human R9 usability sessions against the frozen R8 product baseline documented in `r9-human-usability-qualification.md`.

## Evidence creation

Do not hand-clone the template. Create each session with:

```bash
node scripts/reconstruction/r9_prepare_session.mjs ...
```

Then follow `docs/reconstruction/r9-manual-session-runbook.md` using the generated randomized `measurement_order`.

Completed qualifying sessions belong in:

`docs/reconstruction/evidence/r9/sessions/`

Recommended filename:

`session-YYYYMMDD-NN.json`

The filename must not contain a tester name or private document name.

## What may be committed

- anonymous/non-sensitive session and tester IDs;
- exact frozen baseline commit;
- generic tester familiarity/PDF-experience categories;
- date and generic browser/device/environment metadata;
- corpus IDs and non-sensitive synthetic document IDs;
- randomized measurement order;
- first navigation location chosen;
- boolean first-location correctness;
- Help usage;
- interaction counts;
- boolean completion outcomes;
- navigation predictions and boolean matches;
- concise defect descriptions that do not quote or expose private document contents.

## What must not be committed

- PDF/document bytes;
- copied document contents or extracted text;
- OCR output;
- passwords or encryption secrets;
- personal names, emails, account identifiers, or other tester PII;
- private/confidential filenames;
- screenshots containing confidential documents;
- base64/data-URL document or screenshot payloads.

## Sample-size rule

`HUMAN_UX_TARGET_MET` requires at least:

- 3 valid sessions;
- 3 distinct anonymous tester IDs;
- 2 testers with `none` or `light` prior PDF Studio familiarity.

A valid passing session before that minimum is reached should report `HUMAN_UX_SAMPLE_INSUFFICIENT`.

Repeated sessions from the same tester may be retained for research but do not increase the distinct-tester certification count.

## Validation

Validate one completed session immediately:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs docs/reconstruction/evidence/r9/sessions/session-YYYYMMDD-NN.json
```

Validate all committed sessions and calculate aggregate metrics:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs
```

## Evidence status

An empty sessions directory means `HUMAN_UX_UNMEASURED`. Do not create placeholder sessions, AI-generated observations, copied benchmark results, or browser-automation results merely to satisfy the validator.

Automation may validate and summarize human evidence; it may never manufacture the observations being measured.
