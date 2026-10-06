# P16 — Batch Parity & Encrypted-Queue Ergonomics

P16 implements v7.2 roadmap item **V72-04** while the executable remains v7.1.4.

## Objective

Batch should cover the high-value PDF operations that are genuinely reusable across multiple queued files, while refusing to pretend that every standalone tool belongs in a linear recipe.

P16 therefore closes the most useful deterministic Batch capability gaps and turns encrypted queue items from generic failures into recoverable per-file credential requests.

## Batch recipe schema v4

P16 advances the portable Batch recipe schema from **v3 to v4**.

This is intentionally separate from PDF Studio's persistent application formats. P16 does **not** change:

- `.lpsproject` v9;
- IndexedDB v13;
- native-editor schema v6;
- executable version 7.1.4.

Existing recipe v2/v3 ordered steps migrate deterministically to v4. Passwords are not part of the recipe schema.

## Checked capability matrix

P16 adds a source-controlled matrix covering every standalone Quick task. Each task is classified as **recipe**, **terminal**, or **boundary**.

### Newly promoted recipe operations

- Extract pages
- Remove pages
- Flatten forms / annotations
- Clean risky content
- Compress to target size

These join the existing rotate, optimize, metadata removal, crop, decoration, blank-page insertion, raster compression, grayscale, terminal split, and terminal page-image operations.

### Explicit boundaries

P16 does not force these into reusable recipe semantics:

- PDF merge and visual page organization — multi-input/document-specific composition;
- OCR — recognition and review workflow;
- Repair — recovery workflow requiring review;
- PDF → DOCX / text — different terminal artifact type and fidelity contract;
- Password protection — output secret must not live in portable workflow JSON;
- Unlock PDF — input credential state is handled by the queue rather than represented as a recipe mutation;
- Images → PDF — starts from non-PDF/multi-input source material.

This matrix makes parity measurable without turning Batch into a generic execution container.

## Encrypted queue behavior

A protected PDF may be added to the queue without a password. When execution encounters the protected input:

1. that item changes to **Password required**;
2. other queue items can continue;
3. the user enters a password for that one PDF;
4. PDF Studio validates it by reopening the local bytes;
5. only a successful credential is retained for that item;
6. rerunning resumes the normal recipe.

A wrong password stays recoverable and does not convert the item into an opaque permanent failure.

## Credential privacy

The accepted plaintext password is stored only in an in-memory map owned by the open Batch page.

It is cleared on explicit **Forget**, removing the queue item, clearing the queue, or leaving/unmounting the Batch page.

It is never written to saved/exported `.lpsrecipe.json`, IndexedDB/OPFS, project packages, diagnostics, output filenames, or queue messages.

Imported and previously stored recipe objects are canonicalized to the declared v4 shape before reuse. Unknown top-level or step properties—including fields named like passwords or credentials—are stripped before a recipe can be persisted or exported.

Reloading or navigating away intentionally requires the credential again.

## Encryption-state tracking

A source password is not blindly forwarded forever. PDF rewrites can change encryption state. P16 reopens intermediate output to determine whether no password is required or the existing session credential still opens it.

Later steps receive that resolved credential state. P15 target-size integration uses the same resolved source/output credentials for P8 fidelity verification.

## New deterministic recipe semantics

### Extract / Remove pages

The saved page expression is evaluated against each PDF at that point in its recipe, so it applies to the current intermediate document. Removing every page fails closed.

### Flatten

The step can flatten forms, annotations, or both. A recipe with neither selected is invalid. Flattened content is no longer interactive/editable as the original object.

### Clean risky content

This reuses PDF Studio's security/sanitization engine. It cleans the supported active-content path and may additionally remove attachments and metadata. It is not redaction or malware certification.

### Target-size compression

Batch reuses the qualified P15 bounded target-size engine. If the current intermediate PDF is already at or below the saved target, the step passes it through unchanged.

Otherwise it runs P15's preservation-first bounded ladder. A structural result must pass the existing **P8 fidelity gate** before a later Batch step may consume it.

## Output validity

A completed item is current only when all three identities still match:

1. execution-relevant recipe fingerprint;
2. queued input identity;
3. session credential revision.

Changing any of those makes the prior output stale and requires a rerun. Cosmetic recipe metadata such as workflow name or output suffix does not alter the execution fingerprint.

## Terminal outputs

`split-fixed` and `page-images` remain final recipe nodes.

Split output is a ZIP whose parts are ordered by source page range with deterministic names such as `pages-0001-0010.pdf`.

Page-image output is a ZIP whose PNGs are ordered by source page with deterministic names such as `page-0001.png`.

**Download all ZIP** prefixes each queue item's result with its queue position so cross-item ordering is explicit.

## Release boundary

P16 changes no application persistent schema and creates no network dependency:

- executable: **7.1.4**
- v7.2 target: **7.2.0**
- `.lpsproject`: v9
- IndexedDB: v13
- native editor: v6
- Batch recipes: v4 with explicit legacy migration

## What's next

**P17 — Deep Native-Content Fidelity (V72-05)**

P17 focuses on qualified image, vector, irregular-table, and cross-region text-reflow classes while preserving fail-closed object capability boundaries.
