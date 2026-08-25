# R9 Human Qualification Evidence

This directory is reserved for privacy-safe evidence from real-human R9 usability sessions against the frozen baseline documented in `r9-human-usability-qualification.md`.

## What may be committed

- anonymous/non-sensitive session IDs;
- exact qualified commit SHA;
- date and generic browser/device/environment metadata;
- corpus IDs and non-sensitive document IDs;
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

## Session files

Completed qualifying sessions belong in:

`docs/reconstruction/evidence/r9/sessions/`

Use `docs/reconstruction/r9-session-template.json` as the starting structure. Recommended evidence filename:

`session-YYYYMMDD-NN.json`

The filename must not contain a tester name or private document name.

## Evidence status

An empty sessions directory means `HUMAN_UX_UNMEASURED`. Do not create placeholder sessions with guessed or automated results merely to satisfy the validator.

Automation may validate and summarize human evidence; it may never manufacture the observations being measured.
