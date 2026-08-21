# P2 — Layout-Aware Reflow & Font Fidelity

P2 builds on P1's release-qualified existing-content replacement path. It does not replace PDF Studio's browser-local architecture, create a second editor, or weaken the P1 rule that edited output must reopen and validate before download.

## Goals

1. Retain MuPDF `preserve-spans` font/style evidence instead of collapsing a paragraph to one dominant style.
2. Distinguish visual lines from font/style spans on the same baseline.
3. Allow a paragraph to grow or shrink vertically when a conservative same-column text flow is available.
4. Move only later safe text paragraphs in that same flow.
5. Treat unrelated text columns, images, tables, forms, meaningful vector artwork, and page boundaries as blockers rather than silently moving them.
6. Keep the original source geometry separate from the replacement destination so an expanded/moved edit redacts the correct original bytes.
7. Write all original text redactions before any P2 replacement text is emitted, preventing follower redactions from removing newly expanded content.
8. Measure every emitted style run with the actual MuPDF font object.
9. Allow a compatible Latin or CJK font to be supplied locally without claiming automatic embedded-font extraction.

## Structured-text reconstruction

MuPDF's `preserve-spans` extraction intentionally keeps spans on the same visual line separate when their font/style changes. P2 therefore groups same-baseline spans into visual lines before rebuilding a paragraph.

Each reconstructed text object can now retain:

- `runs[]` with paragraph offsets;
- font name and family;
- point size;
- normal/bold;
- normal/italic;
- extracted color when the runtime JSON exposes it;
- source span count;
- visual line count;
- inferred line spacing;
- inferred alignment and direction;
- conservative text-flow membership.

The persisted native-editor schema remains version 2. All P2 fields are optional, so existing P1 queued edit state remains readable without migration.

## Style preservation when text changes

P2 does not invent arbitrary rich-text semantics. When **Preserve source formatting runs** is enabled:

- unchanged common prefix text keeps its source run styling;
- unchanged common suffix text keeps its source run styling;
- the changed middle inherits the nearest source run;
- adjacent identical runs are merged before export.

This makes edits such as changing a bold word retain the surrounding bold/normal boundaries without pretending PDF Studio has a full word-processor style model.

## Layout-aware flow

Automatic propagation is intentionally conservative.

A text object can enter an automatic flow only when it is:

- safe-reconstruction text;
- horizontal writing;
- not RTL/unknown-direction text;
- not table text;
- not a wide page-spanning heading;
- geometrically aligned with another paragraph in the same column.

For a selected paragraph P2 calculates the replacement height from measured wrapping and retained line spacing. The paragraph keeps its top edge. The difference between original and required height becomes a push-down or pull-up delta for later paragraphs in the same flow.

The plan is refused when destination or swept geometry encounters an unrelated object or crosses the page boundary. P2 does not auto-move images, forms, tables, cross-column text, or meaningful vector artwork.

## Export ordering

P1 applied each replacement as redact-then-write. That is correct for independent fixed boxes but unsafe for P2 expansion: a newly expanded paragraph may occupy a following paragraph's old source rectangle.

P2 therefore uses two text phases:

1. redact every original `sourceBounds` for queued text/table replacements;
2. emit all replacement content at each edit's destination `bounds`.

Other image/vector/form edit semantics remain unchanged.

## Font handling

### Built-in reconstruction

Latin text maps conservatively to Base14 Helvetica, Times, or Courier variants using source family/weight/style evidence. CJK text continues to use MuPDF CJK CID font support.

### Imported matching font

The P2 properties panel accepts local OpenType/TrueType font bytes for Latin as well as CJK reconstruction. Imported bytes are carried only in the local edit queue and worker transfer path.

PDF Studio does **not** claim that a source PDF's embedded subset font has been automatically extracted or reused byte-for-byte. When compatible font bytes are unavailable, the source font name remains evidence while export uses the documented reconstruction font path.

## Complex scripts

Arabic, Hebrew, Indic, and other shaping/bidirectional cases remain appearance-only unless a real shaping engine is introduced and qualified. P2 does not emulate shaping with character placement or claim semantic fidelity it cannot prove.

## Validation

P2 retains P1's output gates:

- save via MuPDF;
- reopen the produced bytes;
- require identical page count;
- require replacement text to be extractable for static text replacements;
- validate requested form edits;
- then return bytes to the main editor;
- the unified editor performs its existing PDF.js validation before download/save-as-project.

P2 additionally reports when layout-aware flow and automatic follower repositioning were used.

## Tests added

- `layoutReflow.test.ts`
  - same-column-only propagation;
  - pull-up and push-down;
  - image collision refusal;
  - page-boundary refusal;
  - wide-heading exclusion.
- `textStyle.test.ts`
  - exact style retention for moved text;
  - nearest-run inheritance for changed text;
  - uniform fallback when no runs exist.
- `nativeSpanReconstruction.test.ts`
  - same-baseline spans become one visual line;
  - mixed bold/color runs survive reconstruction;
  - column flows remain isolated.
- `nativeWorkerContract.test.ts`
  - runtime `Redact` enum remains pinned;
  - `sourceBounds` redaction remains present;
  - two-phase P2 ordering contract remains documented in source;
  - style-run/imported-Latin measured path remains present.
- `p2-layout-reflow.spec.ts`
  - production browser UI and export path across the configured browser matrix.

## Primary implementation references

- MuPDF StructuredText JavaScript reference: https://mupdf.readthedocs.io/en/latest/reference/javascript/types/StructuredText.html
- MuPDF structured text options: https://mupdf.readthedocs.io/en/latest/reference/common/stext-options.html
- MuPDF JavaScript Font reference: https://mupdf.readthedocs.io/en/latest/reference/javascript/types/Font.html
- MuPDF JavaScript PDFDocument reference: https://mupdf.readthedocs.io/en/latest/reference/javascript/types/PDFDocument.html

These references inform the design; PDF Studio's runtime contract tests remain authoritative for the exact pinned MuPDF package used by the repository.

## Deliberate remaining boundaries

P2 is not a general-purpose desktop-publishing layout engine.

- Automatic propagation is limited to conservative same-column text flows on the same page.
- Non-text content is a blocker, not automatically repositioned.
- Reflow does not create or remove pages.
- Exact embedded subset-font extraction/reuse is not claimed.
- Imported single-font reconstruction cannot synthesize missing bold/italic font files.
- Arbitrary per-character rich-text authoring is not introduced; P2 preserves detected source runs around edits.
- Complex-script shaping remains appearance-only.
- Merged tables and content governed by complex clipping/transparency can still fall back to existing conservative editing modes.
