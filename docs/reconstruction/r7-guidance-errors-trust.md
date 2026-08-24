# R7 — Guidance, Errors & Trust Reconstruction

## Purpose

R7 makes PDF Studio explain consequential states in user language without turning the product into a tutorial. It does not change PDF processing semantics, capability decisions, or preservation contracts.

The product should answer five questions when something unusual happens:

1. **What happened?**
2. **Why did it stop or warn me?**
3. **What can I do next?**
4. **Is my original PDF safe?**
5. **Where are the technical details if I need them?**

Routine successful work remains visually quiet.

## Guidance policy

Guidance appears only at decision points:

- before an action with a meaningful limitation or preservation risk;
- when capability preflight blocks a task;
- while a long operation has meaningful progress or can be cancelled;
- after a recoverable failure or cancellation;
- when the application itself cannot render safely;
- when a software update or recovery state needs user action.

R7 does **not** add a global onboarding tour, repeat task descriptions everywhere, or expose engine terminology as the primary explanation.

## User-facing issue taxonomy

The shared `issuePresentation` model uses six conservative categories.

| Category | Meaning | Default response |
| --- | --- | --- |
| Needs your attention | A user-correctable requirement is missing | Explain the missing requirement and retry path |
| PDF limitation | The current PDF cannot be handled safely by this task | Block before mutation and offer an alternative where available |
| Browser limitation | A required browser capability is unavailable | Explain the environment requirement |
| Device resource limit | Local storage or memory is insufficient | Stop before commit and explain how to free resources |
| Cancelled | The user or caller cancelled the operation | Confirm that no new result was committed |
| Unexpected problem | An unclassified product/runtime defect occurred | Stop uncertain output, preserve diagnostics, provide recovery |

Unknown errors default to **Unexpected problem**. R7 intentionally does not guess that an unknown exception is a harmless document limitation.

## Primary message vs technical details

Primary guidance must be understandable without implementation knowledge. Raw exception text, engine names, stack data, and low-level diagnostics belong under **Technical details**.

Examples of primary language:

- “This task did not start. Your PDF is unchanged.”
- “PDF Studio stopped this action instead of releasing a result it could not verify.”
- “The browser could not safely reserve enough local storage or memory.”

Technical data remains available for troubleshooting and continues to be sanitized by the existing diagnostics repository.

## Capability preflight

R4 capability decisions remain authoritative. R7 changes presentation only.

A blocked task now explicitly presents:

- **Why** it cannot start;
- **What you can do** next;
- an alternative task when R4 supplies one;
- the safety statement that the task did not start and the PDF is unchanged.

If the capability check itself throws or times out, PDF Studio no longer embeds that raw exception in the main UI. It records a local diagnostic and blocks the task conservatively with a plain-language recovery path.

## Preservation and destructive actions

`workspace/preservationContracts.ts` remains the single source of truth for Preserved / Changes / Possible losses. R7 does not introduce a second consequence registry.

The existing **What changes?** panel remains the detailed pre-action explanation for rasterization, page-tree rebuilding, redaction, flattening, repair, conversion, and other structure-changing workflows.

## Long operations

`projectOperationCoordinator.ts` remains the source of truth for long-running operation state:

- queued;
- running;
- validating;
- committing;
- named detail text;
- progress when known;
- cancellation when supported.

R7 preserves this model. Operations must continue to identify the actual work being performed rather than showing an unnamed spinner. Validation/commit failures must not present an output as successful.

## Fatal workspace recovery

The React error boundary now uses the shared trust model. A render crash:

- records a sanitized local diagnostic;
- states that PDF Studio stopped instead of continuing with an uncertain state;
- states that the original PDF is unchanged and no new output was released;
- offers Reload workspace, Diagnostics, and Return home;
- keeps the original exception and diagnostic ID under Technical details.

## App updates

The service-worker update notice is guidance, not a modal interruption.

R7 moves it to a compact non-blocking fixed surface and makes the wrapper pointer-transparent so an update notice cannot intercept unrelated workspace controls. On phones it stays above document navigation and disappears while the software keyboard is open.

The notice explicitly states that open PDFs stay local and that an active document operation keeps priority over updating.

## Privacy and trust

R7 does not add telemetry, remote error reporting, or document uploads.

Diagnostics remain browser-local unless the user explicitly exports support information. The existing diagnostic sanitizer continues to remove local paths, blob URLs, and long embedded values from stored records.

## R7 acceptance checks

R7 is acceptable when all of the following hold:

1. capability blockers expose Why, What you can do, and document-safety state;
2. capability-check exceptions are not shown as raw primary copy;
3. unknown exceptions are classified conservatively as product defects;
4. raw technical text is available only under technical details on the shared trust surface;
5. fatal render recovery records diagnostics and offers a clear recovery path;
6. the update notice cannot block ordinary workspace controls;
7. update guidance does not interrupt an active document operation;
8. original preservation contracts and capability decisions remain authoritative;
9. no PDF engine, export, security, OCR, persistence, or schema semantics change;
10. unit and browser regression coverage certifies the R7 contracts.

## Scope boundary

R7 is a product-communication and interaction-safety phase. It does not add new PDF capabilities and it does not claim that a document transformation is reversible when the underlying operation is not.

The next phase, R8, performs the real-world corpus, golden-workflow, usability, responsive, and final release-freeze qualification across the reconstructed product.
