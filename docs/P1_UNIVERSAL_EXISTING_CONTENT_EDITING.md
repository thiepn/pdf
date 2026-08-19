# P1 — Universal Existing-Content Editing

## Product goal

P1 upgrades PDF Studio's existing-content editor from line-by-line replacement toward paragraph-level editing while preserving the consumer-first constraints established in P0.

The target interaction is simple: select text that already exists in a PDF, edit the paragraph as normal prose, and export a real PDF without uploading the document.

## What P1 changes

### 1. Paragraph reconstruction

The native worker already reads MuPDF structured text and emits source-line objects. P1 reconstructs those source lines into a single editable paragraph when they share the same MuPDF text-block identity.

The block identity is a hard boundary. PDF Studio never merges lines from different structured-text blocks, so adjacent columns, captions, headers, and independent page regions remain separate editing units.

Each reconstructed paragraph retains:

- stable source object ids;
- source line text and bounds;
- source font name, family, size, weight, and style evidence;
- source writing mode;
- inferred line height;
- inferred alignment;
- conservative text direction metadata.

This reconstruction happens in memory after inspection. The persisted native-edit queue schema remains version 2, so existing P0/v6 projects do not need migration.

### 2. Better reflow

The old wrapper estimated every non-CJK character as 0.52 em and wrapped by character count. P1 replaces that with deterministic Unicode-aware width classes:

- narrow punctuation and glyphs use smaller advances;
- wide Latin glyphs use larger advances;
- CJK/Hangul characters use full-em advances;
- hard line breaks are preserved;
- long unspaced tokens are split without dropping characters.

The export worker continues to use the same shared `wrapTextToBox` function, so inspection/model tests and exported layout use one deterministic policy.

### 3. Soft-hyphen reconstruction

When a Latin source line ends with a visual line-break hyphen and the following line begins with a lowercase letter, paragraph reconstruction removes the layout hyphen before joining the lines. This prevents common PDF line extraction such as `profes-` + `sional` from becoming permanent prose after editing.

Explicit user-entered line breaks are not removed.

### 4. Style and layout inference

P1 selects dominant paragraph style from its source lines and infers alignment from geometric edge stability. It records median source line advance for later layout decisions.

P1 does **not** claim byte-for-byte editing of original PDF text operators or guaranteed reuse of arbitrary embedded source fonts. Safe Latin/CJK edits remain reconstruction operations and continue to disclose that limitation in capability metadata.

### 5. Permanent redact-and-replace remains authoritative

The existing native export path remains unchanged in its security property: safe text replacement permanently removes the selected source region with MuPDF redaction, adds the replacement text, saves the PDF, reopens it, checks page count, and verifies that replacement text is present.

If the replacement cannot be represented safely, export fails instead of silently accepting a partial result.

## Complex scripts

Arabic, Hebrew, Indic, and other shaping-sensitive scripts remain `appearance-only` unless PDF Studio has a genuine shaping pipeline. P1 intentionally does not simulate complex shaping with naive character placement.

This is a correctness boundary, not a product claim. A later phase may add a real HarfBuzz-backed shaping path and font-subsetting support.

## Multi-column behavior

MuPDF structured-text block boundaries are preserved as hard paragraph boundaries. P1 therefore does not infer one continuous paragraph merely because two lines are vertically adjacent. This is the first multi-column safety rule and prevents the most damaging cross-column reflow error.

## Compatibility

P1 does not change:

- project identities;
- editor overlay object schema;
- native persisted edit schema;
- redaction semantics;
- image/vector/table/form editing;
- PDF encryption handling;
- consumer privacy model;
- P0 startup/precache boundaries.

## Qualification requirements

P1 must pass:

1. native-model unit tests for paragraph grouping, dehyphenation, Unicode wrapping, hard breaks, alignment and totals;
2. TypeScript;
3. P0 consumer performance budget;
4. all inherited PDF Studio release gates;
5. Chromium, Firefox, WebKit, mobile Chromium and tablet WebKit browser regression;
6. privacy and offline regression.

## Remaining limitations after P1

- Arbitrary embedded source fonts are not yet guaranteed to be reusable as writable font resources.
- Complex-script shaping remains appearance-only.
- Paragraph growth does not automatically push unrelated neighboring page objects; P1 reflows within the detected paragraph region. Users can lower font size when replacement prose is materially longer.
- Fully semantic document-wide reflow across independent PDF blocks is intentionally out of scope because PDFs are page-description documents rather than word-processing source files.
