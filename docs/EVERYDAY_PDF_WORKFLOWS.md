# Everyday PDF workflows: audit and implementation

Audit date: 2026-09-27. Baseline: a852b07676e6ffe1ceb46db9bf465c77fe9826b3.

## The product problem

The implementation contained many engines, technical reports, and specialist modes,
but completing a common PDF job still depended on understanding the workspace.
A tool counted as implemented even when it was hidden in a broader mode or ended
by creating another project instead of offering a file.

Evidence in the baseline:
- `src/ia/taskCatalog.ts`: extraction/removal/rotation were keywords inside
  Organize pages; PNG export was bundled under Export PDF content; there were no
  direct JPG, PNG, text, images-to-PDF, or unlock task entries.
- `src/toolbox/exporters.ts`: page image export was PNG-only, all pages, fixed
  scale. Split exported fixed-size groups only.
- `src/views/ToolboxPage.tsx`: PDF-changing actions saved a derived project and
  navigated to Read rather than completing a download-first workflow.
- `src/views/ToolsPage.tsx`: document tasks imported a persistent project before
  doing any work. A one-off conversion therefore depended on browser storage.
- `src/workers/page-operations.worker.ts`: merge rejected protected sources even
  when the user knew the password.
- `src/views/HomePage.tsx`: an incorrect password during retry discarded the
  pending-file prompt. The home page had no task search.

## Comparator baseline

Official catalogs consulted, not a claim that every comparator feature is free:
- https://www.ilovepdf.com/
- https://tools.pdf24.org/en/all-tools
- https://smallpdf.com/organize-pdf
- https://smallpdf.com/split-pdf
- https://www.adobe.com/acrobat/online/extract-pdf-pages.html

The useful pattern is a named job, a clear file chooser, task-specific controls,
and a downloadable result. A large catalog alone is not the acceptance criterion.

## Implemented

A temporary, local-only Quick workflow now covers 15 task IDs:
merge, split, extract, remove, rotate, PDF to JPG, PDF to PNG, PDF to text,
images to PDF, compress, unlock, password protect, page numbers, watermark, crop.
Existing MuPDF/PDF.js engines are reused, not replaced by mock converters.

- Direct routes from Home, tool search, and the current-document tool catalog.
- Current-document reuse and one-use in-memory output hand-off between tools.
- Download-first results; no project creation unless Open in editor is selected.
- Thumbnail selection, all/odd/even presets, custom/descending page ranges.
- Individual-page, every-N, and custom-group splitting; individual files and ZIP.
- Genuine JPG/PNG output with selected pages and 72/150/300 DPI options.
- JPG/PNG/WebP input with order controls, A4/Letter/original sizing and margins.
- Per-file password retry and authenticated merge; authorized password removal.
- Explicit lossy-compression acknowledgement; do not offer a larger compressed
  result as a size reduction.
- Stale-result invalidation when inputs/options change, cancel, accessible labels,
  keyboard order controls, mobile layout, bounded thumbnails/rendering/output.
- Home search uses the same intent ranking as Tools; dedicated tasks outrank broad
  modes. Metadata, authoring, and redundant specialist entries remain available
  under Advanced rather than occupying the everyday grid.

The old workspace routes remain valid. Quick workflows do not take ownership of
editor projects or silently discard editor overlays: current-document reuse loads
that project's underlying PDF bytes, just as the existing utility workflows did.
Unsaved/editor-only overlays are not compiled by Quick tools; export the edited PDF
first. This limitation is disclosed when entering from an editor project.

## Explicit boundaries and next priorities

1. **Editable Office conversion** (DOCX/XLSX/PPTX in both directions): not implemented.
   Plain-text/HTML exports are not equivalent. Qualify a real conversion engine
   against layout, tables, fonts, equations and charts; any remote service requires
   explicit upload consent, retention/security policy, and operating-cost decisions.
2. **Visual page composition**: drag-to-crop, insert/replace arbitrary pages from
   another PDF, interleave duplex scans, and mixed-page visual merge still deserve
   dedicated workflows. Current crop uses numeric margins; file order uses buttons.
3. **Existing-content editing and flat-form filling**: existing editor support is
   bounded. Broader editing claims need real-file fidelity testing; adding text over
   a scan is not equivalent to changing its original text.
4. **OCR ergonomics and compression**: existing local OCR remains available. P15
   adds bounded target-size compression with a structure-preserving first pass and
   explicit optional raster fallback; exact byte targets are still best-effort rather
   than guaranteed, and rasterization remains a disclosed preservation boundary.
5. **Forms/bookmarks/signatures preservation**: page grafts preserve page appearance
   and selectable text, but document-level structures need additional qualification.
   Warn before restructuring; do not claim digital signatures survive modifications.
6. **Validation beyond this change**: browser tests cover generated fixtures. Real
   customer PDFs, very large documents and every browser/device combination still
   require a broader corpus. This change does not certify competitor feature parity.

## Test plan

`npm run typecheck`
`npm run test:unit`
`npm run build`
`PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/everyday-workflows.spec.mjs --project=chromium --project=firefox --project=webkit`

Unit tests cover strict page parsing, split plans, direct routes, natural-language
intent ranking, safe defaults/names, and one-use hand-offs. Browser tests inspect
actual downloaded PDFs with MuPDF; verify page counts/order/rotation, ZIP parts,
image magic bytes, image page sizing, encryption/decryption, compression size,
text/numbering/watermark/crop, wrong-password retry, keyboard controls and mobile
layout. Screenshots are saved in the browser-test artifact.

## Release status

This is an implementation branch, not a published version or full release
certification. The repository's existing deployment policy can intentionally keep
Pages on a tagged stable version; merging a PR is not itself proof that users see
these changes. Do not change the version or bypass release gates merely to publish
an unqualified build.
