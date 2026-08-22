# Manual Workflow Qualification Template

Use this template for R3-R8 manual and representative-workflow evidence. Duplicate the relevant section into a phase report; do not overwrite historical evidence.

## Run metadata

- **Commit SHA:**
- **Build/release channel:**
- **Date:**
- **Tester:**
- **Environment:**
- **Browser/version:**
- **OS/device:**
- **Viewport / browser zoom:**
- **Corpus ID:**
- **Document ID:** use a non-sensitive corpus identifier, not a personal filename when avoidable
- **Workflow ID:**
- **Expected support state:** `available | available-with-warning | experimental | unsupported-for-document | temporarily-unavailable | hidden`

## User task

Write the task in natural user language.

> Example: Make this scanned PDF searchable in German and English.

## Find

- **Expected canonical action:**
- **First location chosen:**
- **Correct first location?** `yes/no`
- **Help required?** `yes/no`
- **Universal tool search used?** `yes/no`
- **Meaningful interactions until tool visible:**
- **Competing/ambiguous locations observed:**

## Understand

- **Primary label understood?** `yes/no`
- **Default settings understandable?** `yes/no`
- **Material warning required?** `yes/no`
- **Warning correctly described consequence?** `yes/no/not-applicable`
- **Unexpected implementation jargon encountered:**
- **Notes:**

## Execute

- **Operation started successfully?** `yes/no/not-applicable`
- **Progress state clear?** `yes/no/not-applicable`
- **Cancel/pause behavior appropriate?** `yes/no/not-applicable`
- **Unexpected error?** `yes/no`
- **If blocked, was it blocked before avoidable work?** `yes/no/not-applicable`
- **Failure category if applicable:** `user-input | document-limitation | browser-platform | resource-storage | product-defect`
- **Notes:**

## Recover

- **Undo available where expected?** `yes/no/not-applicable`
- **Cancel leaves document in valid state?** `yes/no/not-applicable`
- **Irreversible/export-only boundary explained?** `yes/no/not-applicable`

## Export

- **Output path clear?** `yes/no`
- **Output produced?** `yes/no/not-applicable`
- **Expected file count/type produced?** `yes/no/not-applicable`
- **Lossy/rasterizing consequences matched disclosure?** `yes/no/not-applicable`

## Reopen and validate

- **Output reopens in PDF Studio?** `yes/no/not-applicable`
- **Output reopens in external reader where required?** `yes/no/not-applicable`
- **Intended change present?** `yes/no/not-applicable`
- **Required untouched content preserved?** `yes/no/not-applicable`
- **Relevant structure/security/fidelity validation passed?** `yes/no/not-applicable`

## Responsive/usability observations

- **Clipped controls:**
- **Horizontal shell overflow:**
- **Keyboard obstruction:**
- **Touch-target problem:**
- **Hover-only dependency:**
- **Unexpected scroll owner/jump:**
- **Primary action hidden at tested viewport:**

## Result

Choose exactly one:

- `PASS`
- `PASS WITH EXPECTED LIMITATION`
- `BLOCKED CORRECTLY`
- `FAIL`

### Result rationale

Explain the result in product terms. Do not count `BLOCKED CORRECTLY` as a defect when the capability is genuinely unsupported and the application identifies that boundary clearly and early.

## Defects / follow-up

| Severity | Description | Issue/PR | Blocks release? |
| --- | --- | --- | --- |
|  |  |  |  |

## Evidence privacy

Do not commit:

- document contents;
- passwords;
- personal data;
- confidential filenames/screenshots;
- OCR text from private documents;
- file bytes from documents that are not licensed/approved for repository storage.

Prefer generated, public-domain, licensed, or purpose-built qualification material and stable corpus identifiers.
