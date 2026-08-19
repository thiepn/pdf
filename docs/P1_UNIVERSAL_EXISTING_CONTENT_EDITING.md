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

### 2. Paragraph reflow and fit planning

The old editor estimated every non-CJK character as 0.52 em and wrapped by character count. P1 replaces that behavior in two layers.

The editor uses a deterministic Unicode-aware preview model:

- narrow punctuation and glyphs use smaller advances;
- wide Latin glyphs use larger advances;
- CJK/Hangul characters use full-em advances;
- hard line breaks are preserved;
- long unspaced tokens are split without dropping characters.

The properties panel shows the reflowed-line count and the number of lines available in the detected paragraph box. A replacement that obviously does not fit cannot be queued as a static replacement. When possible, the editor offers the largest smaller quarter-point font size that fits the complete text.

This preview is advisory. The native export worker is authoritative.

### 3. Replacement-font metrics in the authoritative worker

For static Latin and CJK replacement, the worker creates the actual MuPDF replacement font resource and measures text with that font's encoded glyphs and glyph advances. Wrapping and center/right alignment therefore use the replacement font's own metrics instead of the former fixed character-width estimate.

The worker fails closed when the complete replacement does not fit its detected box. It never slices wrapped lines to fit and never silently drops overflow text. If the UI's conservative preview and the actual font metrics disagree, the worker rejects the export and reports the fit problem.

### 4. Soft-hyphen reconstruction

When a Latin source line ends with a visual line-break hyphen and the following line begins with a lowercase letter, paragraph reconstruction removes the layout hyphen before joining the lines. This prevents common PDF extraction such as `profes-` + `sional` from becoming permanent prose after editing.

Explicit user-entered line breaks are preserved.

### 5. Source style and layout inference

P1 selects dominant paragraph style from its source lines, records median source line advance, and infers alignment from geometric edge stability. The inferred alignment becomes the editor default rather than resetting every existing text object to left alignment.

P1 does **not** claim byte-for-byte editing of original PDF text operators or guaranteed reuse of arbitrary embedded source fonts. Safe Latin/CJK edits remain reconstruction operations and continue to disclose that limitation in capability metadata.

### 6. Permanent redact-and-replace remains authoritative

Safe static replacement permanently removes the selected source region with MuPDF redaction, writes the replacement content, saves the PDF, reopens the result, checks page count, and verifies that the replacement text can be extracted again.

Because paragraph reflow can legitimately introduce different line breaks, reopened-text verification compares Unicode-normalized text with normalized whitespace as well as a whitespace-free form. This verifies the complete replacement without requiring the same visual line breaks as the input textarea.

If the replacement cannot be represented safely or does not fit, export fails instead of silently accepting a partial result.

## Complex scripts

Arabic, Hebrew, Indic, and other shaping-sensitive scripts remain `appearance-only` unless PDF Studio has a genuine shaping pipeline. P1 intentionally does not simulate complex shaping with naive character placement.

This is a correctness boundary, not a product claim. A later phase may add a real shaping path and font-subsetting support.

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
2. text-fit tests proving overflow is surfaced rather than truncated;
3. an end-to-end browser test that edits existing sample text, permanently applies the native replacement, downloads the result, and reaches post-export validation;
4. TypeScript;
5. the P0 consumer performance budget;
6. all inherited PDF Studio release gates;
7. Chromium, Firefox, WebKit, mobile Chromium and tablet WebKit browser regression;
8. privacy and offline regression.

## Remaining limitations after P1

- Arbitrary embedded source fonts are not yet guaranteed to be reusable as writable font resources.
- Complex-script shaping remains appearance-only.
- Paragraph growth does not automatically push unrelated neighboring page objects; P1 reflows within the detected paragraph region. Users can lower the font size when replacement prose is materially longer.
- Fully semantic document-wide reflow across independent PDF blocks is intentionally out of scope because PDFs are page-description documents rather than word-processing source files.
