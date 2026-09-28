# Task-first workflow redesign — release qualification

## Implemented

- One shared input-compatibility contract for file-first discovery and tool entry. Two PDFs can enter comparison without re-selection; mixed PDFs and images can enter assembly.
- Native PDF page assembly with image conversion only for image sources. Page order preview, move/drag, rotate, duplicate, remove, blank pages, insert/replace files, undo/redo, and duplex-scan interleaving are available without creating a saved project.
- Visual crop selection with editable millimetre margins, page scope and keyboard-accessible numeric controls. Corrected double-transformation of crop coordinates; tests cover rotated and offset page boxes. Cropping is not redaction.
- Explicit extraction output order and batch PDF compression with separate outputs/ZIP.
- Current-document snapshots at task boundaries include live editor overlays, queued supported native edits and live form field values; output is checked before transfer. No fallback to an older source when exporting edits fails. Passwords remain session-only, never in URLs.
- Focused comparison, form-filling/security and OCR task surfaces. Direct downloads, meaningful labels, progressive disclosure, mobile layouts and result-to-next-tool actions.
- Latest OCR output can continue into another task; changing its source settings invalidates the old result.
- Migrated legacy source-audit assertions to meaningful checks for the task-first navigation, while retaining capability gates and operation safety.

## Historical implementation evidence

This section records an early implementation checkpoint, not the current branch status. For release decisions use the current PR head, its Release completion verification certificate, and [the v7.1.0 release contract](P9_RELEASE_CANDIDATE.md).

Implementation commit: `7f5bf4f028d8c685f3f1276bd0c54178f986feaa`.
The implementation was transferred with SHA-256 verification; temporary patch and write-workflow files were removed in that commit.

Local checks on the exact source: TypeScript typecheck passed; all 394 unit tests passed; production build passed; source audit and v6.1 runtime contracts passed.

At that historical checkpoint browser qualification was still running. The initial ten end-to-end scenarios exercise actual downloaded PDFs, not only visible buttons: mixed assembly, page rotation/order, replacement with undo, two-file comparison handoff, selected-page visual crop, current overlay handoff, pending form-value handoff, flat-form fallback, batch compression, and narrow mobile layouts.

**Do not treat local/unit results as full release certification.** Required before deployment: current-commit browser regression, remaining full-product release gates, screenshot review, and deployment-policy checks. Do not bypass failed gates or manufacture human usability evidence.

## Capability boundaries

The current branch supports editable text-only DOCX export with page breaks. Layout-faithful PDF-to-Word, Excel/PowerPoint conversion and Office-file import remain outside the implemented scope. No placeholder tool is advertised as a working converter. Existing-text edits remain bounded by supported PDF structures. OCR creates image-plus-text pages and does not preserve every interactive document feature. Rebuilding or merging page collections can affect document-level forms, bookmarks, signatures and metadata; preservation disclosures remain. Numeric/visual cropping does not permanently erase cropped content.

Some specialist professional/compliance/legacy utility interiors still require dedicated interaction review. Automated tests do not establish first-use usability on real devices. This document is a qualification record, not a claim of universal feature completeness or production deployment.
