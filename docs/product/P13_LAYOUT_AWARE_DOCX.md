# P13 — Layout-Aware PDF → DOCX Export 2.0

P13 implements v7.2 roadmap item **V72-01** without cutting the executable version from v7.1.4.

## Objective

Replace the previous text-only PDF → Word export with a materially useful **editable DOCX reconstruction** while preserving PDF Studio's browser-local privacy boundary.

The goal is not pixel-identical Office conversion. PDF and DOCX use different layout models. P13 reconstructs the parts that can be represented honestly as editable Word structures and explicitly reports the parts that cannot.

## Architecture

P13 deliberately reuses existing product engines rather than adding another parser:

- **Native inspection** supplies paragraph reconstruction, source text runs, page geometry, detected images, structured tables, and conservative column-flow metadata.
- **PDF.js** renders only detected image regions that need visual embedding in Word.
- **OOXML generation** is local and dependency-free. The DOCX package is a stored ZIP containing editable WordprocessingML plus bounded PNG media.
- No PDF bytes, text, images, credentials, or output are uploaded to a conversion service.

## Editable content

### Paragraphs

Each qualified source text block becomes Word text, not a page screenshot.

P13 carries forward:

- reconstructed paragraph text;
- source font name when usable;
- point size;
- bold and italic state;
- text color;
- left / center / right / justified alignment;
- RTL paragraph/run flags where inspection identifies RTL;
- source-informed paragraph spacing.

Subset font prefixes are removed from Word-facing font names. Unusable Type3/Identity-style names fall back to a normal Word font name instead of being emitted as fake installed fonts.

### Tables

Qualified detected tables become native Word tables.

P13 supports:

- row/column structure;
- source-informed column widths;
- cell text;
- horizontal and vertical alignment;
- cell fill/text color when represented by the inspection;
- common horizontal/vertical merged cells using OOXML grid-span and vertical-merge semantics.

Text that belongs to an emitted table is removed from the ordinary paragraph stream so the DOCX does not repeat table contents.

Complex or low-confidence table regions are not silently promoted to editable tables.

### Images

Detected source-image regions are embedded as separate PNG media objects.

P13 renders the source page through PDF.js once per selected page, then crops only qualified image regions. This preserves the image's visible PDF appearance without flattening the page's editable text or table structures.

Guardrails:

- maximum 48 embedded image regions per export;
- maximum 6,000,000 pixels for the bounded page-render surface;
- tiny image regions are skipped;
- near-page-scale background images are skipped to avoid duplicating scanned-page backgrounds behind OCR text;
- skipped images are reported.

### Page geometry

Each selected source page becomes a Word section boundary with source-informed:

- page width;
- page height;
- portrait/landscape orientation;
- bounded margins inferred from reconstructed content.

This preserves meaningful page breaks and geometry without claiming identical PDF pagination after Word reflows the editable content.

## Reading order

Single-column content follows geometric top-to-bottom order.

When the existing native inspector exposes multiple overlapping text flows, P13 emits each conservative column flow in sequence and records a **multi-column heuristic warning**. It does not claim universal reading-order inference for arbitrary magazine/newspaper layouts.

## Explicit fidelity boundary

P13 does **not** claim:

- pixel-identical PDF → Word reproduction;
- exact line wrapping after Word font substitution/reflow;
- arbitrary floating-object anchoring;
- editable conversion of PDF vector paths, shadings, patterns, nested Form XObjects, or diagrams;
- preservation of PDF forms, JavaScript, annotations, signatures, layers, or PDF-specific metadata as equivalent Word structures;
- DOCX → PDF import;
- Excel/PowerPoint conversion;
- general Office round-trip fidelity.

Vector/nested artwork is disclosed as omitted from editable Word drawing conversion rather than silently described as preserved.

## Scanned PDFs

A page with no selectable text still follows the existing product rule: use **OCR PDF** first.

P3 OCR 2.0 can add source-preserving invisible searchable text; the resulting document can then enter P13. P13 does not create a second OCR engine.

## Output packaging

The generated DOCX contains:

- `[Content_Types].xml`;
- root relationships;
- `word/document.xml`;
- document image relationships;
- bounded `word/media/*.png` assets;
- core/app properties.

The ZIP writer accepts binary entries directly so embedded image bytes are not coerced through UTF-8 text.

## Consumer UX

The task is now labelled **PDF to Word**, not **PDF to Word (text)**.

Consumer copy and offline Help state that the tool reconstructs editable paragraphs, common tables, images, page geometry, and supported styling while exact PDF line wrapping and complex drawings can differ. The Help action and browser acceptance use the same **PDF to Word** name as the task catalog.

## Release / schema boundary

P13 changes no persistent storage format:

- executable version remains **7.1.4** while the v7.2 line is pre-cut;
- target version remains **7.2.0**;
- `.lpsproject` remains v9;
- IndexedDB remains v13;
- native editor state remains v6.

## Automated acceptance

P13 tests verify:

- table text is not duplicated into paragraph output;
- common tables emit real `w:tbl` structures;
- merged cells use OOXML grid-span semantics;
- font weight/color/style metadata reaches WordprocessingML;
- image bytes are binary-safe ZIP media with relationships;
- page geometry reaches `w:pgSz`;
- multi-column ambiguity produces a warning and deterministic column order;
- the Quick PDF→DOCX route uses the P13 builder rather than `buildSimpleDocx`;
- old text-only consumer/help wording is removed;
- the Help → PDF to Word browser contract follows the new task name and fidelity warning.

## Definition of Done

P13 is complete when the source audit, targeted unit suite, TypeScript, inherited P11/P12 controls, and exact-head CI pass.

## What's next

**P14 — Complex-Script Existing-Text Editing**

P14 implements V72-02, beginning with qualified Arabic/RTL shaping and bidi reconstruction rather than extending the current appearance-only fallback.
