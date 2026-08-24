# R4 — Reliability & Capability-Gating Reconstruction

## Objective

R4 eliminates **false affordances**: a PDF task must not look ready, accept user setup work, and only then fail for a condition PDF Studio could have detected beforehand.

R4 does not add PDF engines. It adds one shared product-level support contract in front of existing engines and keeps the existing post-processing validators as defense in depth.

## Canonical runtime states

R4 implements the R0 support-state vocabulary exactly:

- `available`
- `available-with-warning`
- `experimental`
- `unsupported-for-document`
- `temporarily-unavailable`
- `hidden`

Classification in the R1 feature registry remains separate from runtime support state.

## One resolver, multiple entry points

`src/capabilities/taskCapability.ts` is the canonical task capability resolver.

The same resolver is consumed by:

1. global **Tools** before a PDF is selected;
2. current-document **Tools** after project metadata is known;
3. task-specific workspace routes before the target implementation mounts.

Ctrl/Cmd+K already routes through the canonical task catalog. Because current-document task routes retain `taskId`, command-palette launches pass through the same workspace guard instead of bypassing support checks.

## Preflight evidence levels

R4 intentionally distinguishes cheap and deep checks.

### Generic context

Available before a document is selected:

- Worker support;
- WebAssembly support;
- static material-loss or certification boundaries.

### Project context

Available cheaply after import from the project manifest and editor state:

- page count;
- form-field count;
- encryption flag;
- outline/attachment/JavaScript summary where relevant;
- saved editor redaction marks.

This context powers current-document task cards without launching expensive workers merely to render Tools.

### Deep task-entry preflight

Used only when a task needs source-level evidence that is not already persisted. R4 deep-inspects Protect/security structure at task entry for:

- **Fill PDF forms** — distinguish truly writable fields from read-only, signature, or button-only widgets;
- **Apply permanent redactions** — detect existing PDF redaction annotations;
- **Flatten supported PDF content** — determine whether there are supported non-signature form fields or page annotations to flatten.

An inconclusive deep inspection is not converted into a false unsupported claim. Protected or temporarily unreadable PDFs are allowed to continue to the secure workspace, which can request the session password and run its existing authoritative inspection.

## Initial authoritative gates

### Fill PDF forms

`unsupported-for-document` when `formFieldCount === 0`.

If widgets exist, task-entry security inspection also blocks when none are writable supported form fields.

Recovery: use Edit for visually flat forms or choose a PDF with writable AcroForm fields.

### Split PDF

`unsupported-for-document` when `pageCount < 2`.

Multi-page PDFs remain available with a warning that whole-document structures and signature meaning may not transfer completely to split parts.

### Apply permanent redactions

After source inspection is conclusive, `unsupported-for-document` when there are no saved editor redaction marks and no existing PDF redaction annotations.

Recovery routes to **Mark areas for redaction**.

If redactions exist, the task is `available-with-warning` because application permanently removes covered content from the derived output.

### Flatten supported PDF content

After deep inspection, `unsupported-for-document` when no supported non-signature form fields or page annotations exist.

When flattenable content exists, the task remains `available-with-warning` because the new copy loses interactivity or editability for the flattened content.

### OCR PDF and Protect tasks

OCR and Protect/security tasks are `temporarily-unavailable` when required Worker or WebAssembly support is absent.

When runtime support exists, OCR remains `available-with-warning` because the current pipeline creates a searchable raster reconstruction rather than preserving original page operators and adding only an invisible text layer.

## Material consequence warnings

R4 exposes material boundaries before execution for:

- visual signatures — appearance only, not certificate-backed signing;
- permanent redaction — destructive only in the derived output;
- redaction marks — not permanent until applied;
- CropBox cropping — not secure erasure;
- splitting — whole-document structures may not carry cleanly to parts;
- sanitization — deliberately removes selected document content;
- flattening — removes supported interactivity/editability;
- OCR — searchable raster reconstruction;
- grayscale — rasterizes pages and loses interactive/vector structure;
- accessibility — limited remediation, no arbitrary PDF/UA certification claim;
- print layout — not a complete prepress/separations/bleed/ICC workflow;
- repair — finite clean rewrite, not universal malformed-PDF recovery.

**Archive readiness** is explicitly `experimental`; PDF Studio does not claim certified PDF/A conformance.

## Router anti-bypass rule

A canonical task route has the form:

`#/workspace/<project>/<mode>/<taskId>`

Before the mode implementation mounts, `CapabilityGatedWorkspace` verifies:

1. the task exists;
2. the task's declared workspace mode matches the URL mode;
3. the project capability context can be built;
4. any required deep preflight completes or is explicitly inconclusive;
5. the resolved support state permits execution.

Unsupported and temporarily unavailable tasks render a blocker instead of mounting the PDF tool.

Legacy workspace routes without a task ID remain compatible because they do not claim that a specific canonical task has already passed preflight.

## Failure policy

Capability preflight fails closed when PDF Studio cannot establish the project-level context required to judge a task. The blocker explains that the support check itself failed and routes back to Tools.

Deep source inspection is different: if the source is protected and the secure workspace is specifically responsible for authenticating it, R4 records the deep check as inconclusive and does not invent an unsupported result.

## Relationship to existing validators

R4 does not weaken or replace:

- editor export reopening;
- security-critical output validation;
- P8 fidelity checks;
- organizer page-count validation;
- OCR output validation;
- toolbox output validation;
- release corpus qualification.

Preflight answers **“should the user start this task?”** Existing validators still answer **“is the produced output safe to release?”**

## Out of scope

R4 does not attempt to predict every malformed-PDF or engine-runtime failure. A condition becomes a preflight gate only when PDF Studio has sufficiently reliable evidence to state the support result before execution.

That limitation is intentional: false confidence is considered as harmful as late failure.
