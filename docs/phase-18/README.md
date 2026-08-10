# Phase 18 — Complete Toolbox & Automation Layer

## Objective

Turn Local PDF Studio's existing specialist workspaces into a practical everyday PDF suite without fragmenting project state or weakening Phase 16 revision guarantees.

Phase 18 adds one Toolbox workspace for common structural/document utilities and upgrades Batch from a fixed preset into an ordered recipe pipeline.

## Toolbox architecture

Structural transforms use this path:

```text
source revision
  → local MuPDF worker transform
  → save/reopen validation
  → Phase 16 derived-project transaction
  → independent revision lineage entry
```

Content exports such as TXT, Markdown, HTML, PNG pages, and split ZIPs are non-mutating downloads and do not change project state.

## Structural tools

- Watermark
- Header
- Footer
- Page numbers
- CropBox margins
- Blank-page insertion
- Metadata edit/remove

All physical page inputs shown by Phase 18 use millimetres. Point conversion exists only inside the PDF implementation.

### Decoration scripts

Static decoration supports Latin plus MuPDF CJK CID-font paths for:

- Korean
- Japanese
- Simplified Chinese
- Traditional Chinese

Complex shaping scripts are rejected by the static Toolbox writer instead of being silently malformed. The unified Edit workflow remains the safer fallback for appearance-only complex-script work.

## Export tools

- PDF → text
- PDF → Markdown
- PDF → standalone HTML
- PDF pages → PNG ZIP
- PDF → fixed-page PDF-part ZIP
- PDF → grayscale raster derived revision

Text/Markdown/HTML exports prioritize extracted content rather than visual reconstruction. Grayscale is explicitly raster and therefore not a preservation workflow.

## Batch 2.0

A queue captures an immutable recipe snapshot when a run starts. Pausing keeps that snapshot locked; edits are available only after the paused run is explicitly ended. Completed outputs may be downloaded individually or as one locally generated ZIP with collision-safe entry names.


Recipes are ordered arrays of typed nodes. Current nodes:

1. Rotate
2. Lossless optimize
3. Remove metadata
4. Crop
5. Watermark/header/footer/page numbers
6. Insert blank pages
7. Raster compression
8. Grayscale raster conversion

Execution stays sequential per file to bound browser memory. Legacy recipe fields are migrated to schema 2 in their original logical order.

## Non-duplication rule

Phase 18 reuses existing specialist workflows rather than cloning them:

- image/camera → PDF: Scan
- free-form page organization/extraction: Organizer
- encrypt/unlock/flatten/redact/sanitize: Secure
- N-up/booklet and text DOCX: Professional
- PDF/A/accessibility/forms: Compliance

## Deferred conversions

The release deliberately does not add low-fidelity checkbox features for Office or browser HTML/Markdown → PDF. Those workflows require a layout/shaping/conversion engine that can meet the product's fidelity standard. A future desktop/local-companion path can provide this without sending documents to a server.
