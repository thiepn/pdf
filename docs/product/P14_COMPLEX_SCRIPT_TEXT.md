# P14 — Complex-Script Existing-Text Editing

P14 implements v7.2 roadmap item **V72-02** without cutting the executable version from v7.1.4.

## Objective

Replace the generic appearance-only treatment of **qualified Arabic-script existing text** with a real local shaping and bidirectional reconstruction path.

P14 does not redefine “complex scripts” as universally editable. The first qualified family is deliberately narrow and measurable.

## Qualified script matrix

| Script family | Static existing-text replacement | Shaping | Bidi | Font path | Reflow |
| --- | --- | --- | --- | --- | --- |
| Arabic script / RTL | Qualified, fixed-box | HarfBuzz | Unicode bidi algorithm | Validated imported TTF/OTF → MuPDF Identity-H CID font | Fixed-box only |
| Hebrew | Not qualified | — | — | — | — |
| Indic scripts | Not qualified | — | — | — | — |
| Other shaping-dependent scripts | Not qualified | — | — | — | — |

Arabic paragraphs may contain Latin labels, digits, combining marks, punctuation, symbols and whitespace. Explicit Unicode bidi-control characters and unrelated scripts fail closed.

## Why P14 needs shaping

Writing Arabic Unicode characters directly into a PDF text operator is insufficient:

- contextual Arabic forms depend on neighboring characters;
- ligatures may map several Unicode characters to one glyph;
- combining marks need positioned offsets;
- RTL paragraphs can contain LTR numbers, Latin words and punctuation;
- visual glyph order is not the same as logical Unicode order.

P14 therefore separates **logical text**, **bidi ordering**, **glyph shaping**, and **PDF glyph placement**.

## Shaping architecture

### HarfBuzz

`harfbuzzjs@1.6.2` is loaded in the native editor worker.

For each visual bidi run P14:

1. passes logical run text to HarfBuzz;
2. sets LTR/RTL run direction;
3. lets HarfBuzz infer script/language properties;
4. shapes against the exact locally imported font;
5. consumes glyph IDs, advances and offsets;
6. places the resulting glyphs explicitly in the PDF.

This is a glyph pipeline, not presentation-form substitution.

### Unicode bidirectional ordering

`bidi-js@1.1.0` resolves embedding levels and visual run order according to the Unicode Bidirectional Algorithm.

P14 keeps logical Arabic text intact while:

- ordering RTL and LTR runs for painting;
- retaining European/Arabic digits in their resolved directional runs;
- applying Unicode mirroring for qualified RTL punctuation before shaping.

### PDF font path

The imported TTF/OTF is parsed by the existing MuPDF font validator before **Apply** becomes available.

Export then creates the font resource through MuPDF's `PDFDocument.addFont(...)` path, which produces the Identity-H CID mapping needed for shaped glyph IDs.

The writer emits two-byte CID/GID values rather than pretending shaped glyph IDs are Unicode code points.

## Logical text preservation

Visual glyph order is unsuitable as extracted Unicode.

Every shaped output line is wrapped in marked content carrying:

`/ActualText <UTF-16BE logical line>`

This keeps logical text semantics separate from the visual glyph sequence and provides an explicit extraction/search representation for ligatures and bidi reordering.

## Font qualification

Arabic reconstruction has **no built-in fallback font**.

The user must import a local TTF/OTF for the selected text block. Existing font validation checks:

- the font can be parsed by the same MuPDF engine used during export;
- every current character has glyph coverage;
- validation is refreshed if the text changes;
- oversized font files remain blocked by the existing 25 MB limit.

The imported bytes stay local to the project/session path already used by existing-font editing.

## Fixed-box scope

P14 intentionally keeps Arabic edits inside the detected text region.

HarfBuzz metrics are used again at export to calculate real shaped line widths. Export fails instead of clipping when:

- shaped width exceeds the fixed region;
- wrapped shaped lines need more height than the region provides.

Cross-paragraph RTL reflow is not enabled in P14 because the existing P2 follower model was qualified for simpler same-column reconstruction and does not yet carry RTL-specific flow evidence.

## Bulk editing

Automatic Find/Replace remains fail-closed for Arabic.

Each Arabic replacement needs an explicitly chosen validated font, so the bulk planner reports the match for manual review rather than silently creating a Latin/CJK-style edit.

## Unsupported cases

P14 still does **not** claim:

- universal Unicode existing-text reconstruction;
- Hebrew shaping/editing;
- Devanagari, Bengali, Tamil or other Indic shaping;
- mixed unrelated complex scripts in one qualified Arabic block;
- explicit bidi override/isolate control characters;
- source-font byte reuse when the source embedded font cannot be recovered;
- exact source kerning/wrapping when a replacement font differs;
- automatic RTL flow expansion across neighboring objects, columns or pages.

These cases remain appearance-only or unsupported according to the existing capability model.

## Validation

P14 adds three layers:

1. deterministic script/bidi policy tests;
2. a HarfBuzz integration fixture using the CI-installed Noto Arabic font;
3. source-contract auditing for font validation, Identity-H embedding, shaped glyph output, `ActualText`, fail-closed bulk replacement and unchanged schemas.

The existing Phase 28 `rtl-arabic.pdf` remains part of the broader adversarial corpus.

## Release boundary

P14 changes no persistent format:

- executable version remains **7.1.4**;
- v7.2 target remains **7.2.0**;
- `.lpsproject` remains v9;
- IndexedDB remains v13;
- native-editor schema remains v6.

The two new dependencies are browser-local text-layout engines, not network services.

## What's next

**P15 — Structure-Preserving Target-Size Compression**

P15 implements V72-03: target byte/MB compression with bounded attempts, preservation-first optimization and explicit unattainable-target reporting.
