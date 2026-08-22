# R0 Core and Golden Workflows

## 1. Purpose

This document defines the user tasks that outrank feature-count growth during R1-R8. The workflows are written in user language and remain stable even if the underlying PDF engines, panels, or implementation routes change.

A workflow is product-complete only when the applicable sequence passes:

**Find -> Understand -> Execute -> Recover -> Export -> Reopen -> Validate**

## 2. Priority model

- **G1 — Golden / release-critical:** failure blocks reconstruction certification unless the operation is correctly capability-gated for an unsupported document.
- **G2 — Important:** expected to be reliable and discoverable but does not independently block every consumer scenario.
- **G3 — Specialist:** must be truthful and safe, but may live behind Advanced/More.

## 3. Golden workflow set

### Editing and markup

| ID | Priority | User intent | Expected default outcome |
| --- | --- | --- | --- |
| GW-01 | G1 | Edit existing text | Select text, edit supported content, export valid PDF |
| GW-02 | G1 | Add text | Place new text with basic styling and export |
| GW-03 | G1 | Remove visible text | Delete supported editable text or clearly route to redaction when permanence/security is intended |
| GW-04 | G1 | Replace an image | Select existing supported image, replace, fit/crop, export |
| GW-05 | G1 | Move or resize an image | Direct manipulation with predictable geometry |
| GW-06 | G1 | Highlight text | Create/edit/remove highlight annotation |
| GW-07 | G2 | Add a comment | Add comment/note and preserve it on export |
| GW-08 | G2 | Draw or ink | Draw, edit/remove where supported, export |
| GW-09 | G2 | Add or edit a link | Define destination/URL with safe validation |
| GW-10 | G1 | Add a visual signature | Place visual signature without implying cryptographic signing |
| GW-11 | G1 | Permanently redact content | Mark, apply permanent redaction, explain permanence, validate removal |

### Page and document structure

| ID | Priority | User intent | Expected default outcome |
| --- | --- | --- | --- |
| GW-12 | G1 | Merge PDFs | Combine selected documents in chosen order |
| GW-13 | G1 | Split a PDF | Produce clearly named independent outputs |
| GW-14 | G1 | Extract pages | Save selected pages as a new PDF |
| GW-15 | G1 | Delete pages | Remove selected pages with undo/staging semantics before export |
| GW-16 | G1 | Reorder pages | Thumbnail-driven reorder with clear selection state |
| GW-17 | G1 | Rotate pages | Rotate selected/current/range with explicit scope |
| GW-18 | G1 | Crop pages | Change visible page crop with clear warning that crop is not secure deletion |
| GW-19 | G2 | Duplicate or insert pages | Add pages predictably without losing document structure outside stated boundaries |

### Whole-document operations

| ID | Priority | User intent | Expected default outcome |
| --- | --- | --- | --- |
| GW-20 | G1 | Compress a PDF | Choose understandable quality/size tradeoff, produce smaller output where feasible |
| GW-21 | G1 | Make a scan searchable | OCR selected/all pages with language choice, progress, output validation |
| GW-22 | G1 | Remove metadata/private extras | Sanitize selected metadata/active content with explicit scope |
| GW-23 | G1 | Password-protect a PDF | Set encryption/password/permissions with safe password handling |
| GW-24 | G2 | Flatten a document | Explain what interactive content becomes static before applying |
| GW-25 | G2 | Compare two PDFs | Pair documents/pages, show meaningful differences, handle unmatched pages |

### Forms and creation/conversion

| ID | Priority | User intent | Expected default outcome |
| --- | --- | --- | --- |
| GW-26 | G1 | Fill an existing form | Edit supported AcroForm fields and export values correctly |
| GW-27 | G1 | Turn images into a PDF | Import images, order pages, create PDF |
| GW-28 | G1 | Export PDF pages as images | Select page range/resolution and receive page images/ZIP |
| GW-29 | G2 | Export PDF text | Export extracted text with limitations stated |
| GW-30 | G2 | Export to Markdown/HTML | Export content-first representation with fidelity limitations stated |
| GW-31 | G2 | Export to DOCX | Export editable text-focused DOCX without promising layout fidelity |
| GW-32 | G2 | Create a PDF from structured text | Create searchable PDF through supported creator workflow |

### Specialist workflows

| ID | Priority | User intent | Expected default outcome |
| --- | --- | --- | --- |
| GW-33 | G3 | Batch-process multiple PDFs | Apply validated ordered recipe with per-file status |
| GW-34 | G3 | Add Bates numbering | Configure range/prefix/position and export reliably |
| GW-35 | G3 | Check accessibility | Inspect meaningful accessibility issues and only offer repairs actually supported |
| GW-36 | G3 | Prepare an archival candidate | Prepare PDF/A candidate while explicitly avoiding certification claims |
| GW-37 | G3 | Inspect document structure | Technical inspection isolated from everyday editing UI |
| GW-38 | G3 | Attempt safe repair | Explain repair scope and never imply unrecoverable bytes can always be fixed |
| GW-39 | G3 | Prepare print layout | N-up/booklet and related supported print transformations with rasterization consequences stated |
| GW-40 | G3 | Inspect signature coverage | Report ByteRange/coverage evidence without implying certificate trust validation |

## 4. Top-20 discoverability set

The following intents form the primary R2 findability benchmark:

1. Edit text
2. Add text
3. Replace image
4. Highlight
5. Sign visually
6. Redact permanently
7. Merge
8. Split
9. Extract pages
10. Delete pages
11. Reorder pages
12. Rotate pages
13. Crop
14. Compress
15. OCR
16. Remove metadata
17. Password-protect
18. Fill form
19. Images to PDF
20. PDF pages to images

These tasks should be findable without understanding PDF Studio's internal architecture.

## 5. Top-10 no-Help usability set

R8 should manually test whether a user can complete these without opening Help:

1. Edit existing text
2. Highlight text
3. Sign visually
4. Permanently redact
5. Merge PDFs
6. Delete/reorder pages
7. Compress PDF
8. OCR scan
9. Fill form
10. Images to PDF

## 6. Workflow contract template

Every R3 workflow specification must define:

### User statement

A natural-language task, e.g. "Make this scanned document searchable."

### Canonical action

One stable product name, e.g. `OCR PDF`.

### Entry points

- canonical navigation location;
- universal tool-search term(s);
- optional context shortcut.

Secondary entry points must route to the same workflow.

### Preconditions

What the app can detect before exposing/starting the operation.

### Default path

The shortest safe path for a normal user.

### Advanced path

Only options that justify additional complexity.

### Capability states

Expected behavior when the document/context is:

- supported;
- supported with material fidelity warning;
- unsupported;
- password/encryption blocked;
- resource constrained;
- browser/platform constrained.

### Progress/cancel behavior

Required for non-trivial operations.

### Output semantics

Clarify whether the result:

- modifies the working revision;
- creates a derived revision;
- downloads a copy;
- produces multiple outputs;
- rasterizes or flattens content.

### Validation

Define what is checked after output creation/reopen.

### Failure language

Define user-readable failure categories and any safe alternative.

## 7. Destructive-operation rules

For deletion, redaction, sanitization, flattening, rasterization, and page removal:

- distinguish visual hiding from permanent removal;
- distinguish staged working changes from irreversible exported consequences;
- provide undo before finalization where architecture permits;
- never imply crop is secure deletion;
- never imply visual signature is cryptographic;
- never imply rasterized output preserves interactive/vector structure;
- never imply accessibility/PDF-A preparation equals external certification.

## 8. R3/R4 test corpus expectations

Each golden workflow must be tested on representative third-party PDFs that exercise relevant boundaries, including where applicable:

- office-generated PDFs;
- browser-generated PDFs;
- scans;
- forms;
- CJK documents;
- complex-script documents;
- encrypted documents;
- image-heavy documents;
- vector-heavy documents;
- unusual page geometry/rotation;
- annotations;
- malformed but readable inputs;
- large page counts.

Generated fixtures remain useful for deterministic regression, but they must not be the only workflow evidence.

## 9. Certification interpretation

A workflow result of `BLOCKED CORRECTLY` is acceptable when the product does not support the requested operation for that document and communicates the limitation before unsafe or futile execution.

A workflow is a `FAIL` when, among other cases:

- the user cannot reasonably find it;
- a supported operation returns an unexpected error;
- a known unsupported condition is discovered only after unnecessary execution;
- output silently loses structure beyond the disclosed contract;
- output cannot reopen or validate;
- the UI claims a stronger capability than the implementation provides.
