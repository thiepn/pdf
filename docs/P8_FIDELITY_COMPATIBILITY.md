# P8 — Fidelity & Compatibility

P8 is the compatibility-hardening phase for the unified P1–P7 editor. It does not add another editing primitive. It makes existing editing paths fail closed when export changes document structure or untouched content in ways the requested edit did not authorize.

## Goals

P8 certifies three export classes:

1. native-only P1–P7 edits;
2. overlay-only editor changes;
3. mixed overlay + native edits using the P6 overlay-first/native-replay architecture.

Mixed exports are validated end-to-end against the original source PDF after both stages have completed.

## Fidelity profile

Each editor export builds a deterministic source/output profile using PDF.js. The profile records:

- page count;
- sampled page view/crop box, rotation and `UserUnit`;
- sampled text extraction digest and character count;
- sampled image and vector operator counts;
- sampled annotation, link and widget counts;
- outline entry count;
- attachment count;
- AcroForm field count;
- document-JavaScript presence;
- page labels;
- core metadata (`Title`, `Author`, `Subject`, `Keywords`, `Creator`);
- encryption presence;
- container signals for incremental revisions, object streams, xref streams and linearization.

## Fail-closed rules

P8 rejects an export when a requested edit unexpectedly changes:

- page count;
- encryption state;
- outline count;
- attachment count;
- form-field count;
- document-JavaScript presence;
- page labels;
- core metadata;
- sampled page box / rotation / `UserUnit`;
- widget count on an edited page;
- text extraction on an untouched sampled page;
- image/vector operation counts on an untouched sampled page;
- annotation/link/widget counts on an untouched sampled page.

Semantic changes to pages deliberately edited by P1–P7 are allowed. Existing specialist writers remain responsible for validating the exact requested object change.

## Bounded deterministic sampling

Compatibility validation must not become an unbounded second rendering pipeline for very large documents.

The fidelity sampler therefore:

- always includes document anchors (first and last page);
- includes ordinary affected pages completely when the edit set is small;
- includes neighboring pages while capacity remains;
- fills remaining capacity with deterministic evenly spaced pages;
- caps semantic inspection at 32 pages for very large batch edits.

If a batch edit exceeds this bound, the export remains subject to specialist writer validation and P8 emits an explicit bounded-sampling warning.

## Container normalization

Byte-for-byte identity is not a P8 requirement. PDF writers may legitimately normalize:

- incremental revision chains;
- classic xref tables versus xref streams;
- object-stream packing;
- linearization data;
- compression and object numbering.

P8 therefore treats container structure as compatibility evidence rather than semantic identity. Incremental and linearized sources produce warnings when export may normalize those properties.

Encryption is different: changing encrypted ↔ unencrypted state is a hard failure.

## External-reader compatibility corpus

`scripts/p8/generate_compatibility_corpus.py` creates deterministic fixtures for:

- classic PDF content;
- rotated and cropped pages;
- AES-256 encryption;
- object streams;
- nested reusable Form XObjects;
- transparency / ExtGState alpha;
- incremental revisions;
- annotations and links;
- non-zero page origins.

`scripts/p8/validate_compatibility_corpus.py` independently opens and inspects every fixture with both **PyMuPDF** and **pypdf**. The CI report is written to:

`docs/p8/compatibility-corpus-report.json`

## Compatibility boundary

P8 validates preservation and reopenability. It does not promise that every PDF feature becomes directly editable.

Features that remain protected or capability-gated by earlier phases continue to fail closed rather than being flattened or silently rewritten. This includes signed fields, unsupported clipping relationships, unsupported text encodings and unsafe nested-stream rewrites.

## P9 handoff

After P8 is fully green, P9 should be release-candidate work only: final regression certification, packaging, documentation, release notes, deployment verification and defect-only hardening. New editing primitives should not be introduced in P9.
