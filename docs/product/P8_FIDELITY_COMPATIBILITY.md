# P8 — Fidelity & Compatibility

## Objective

P8 turns the existing fidelity profiler into a mandatory output gate for the current P1–P7 workflows. It does not add a new editing primitive. It prevents a requested edit from silently changing unrelated document structure or untouched content.

## Covered output classes

P8 validates:

1. overlay-only editor exports;
2. native-content editor exports;
3. mixed native + overlay exports;
4. P7 form-authoring exports;
5. P7 permanent-redaction exports;
6. Secure cleanup/protection exports where structural changes are explicitly requested.

## Preservation evidence

The deterministic PDF.js fidelity profile checks:

- page count;
- sampled page box / crop geometry;
- rotation and UserUnit;
- untouched-page text extraction digest;
- untouched-page image/vector operation counts;
- annotation, link and widget counts;
- outline entry count;
- attachments;
- interactive form-field count;
- JavaScript presence;
- page labels;
- core metadata;
- encryption state;
- container signals including incremental revisions, object streams, xref streams and linearization.

Semantic inspection is bounded to a deterministic maximum of 32 pages.

## Intent-aware compatibility

P8 fails closed by default. Structural differences are accepted only when the active workflow explicitly authorizes them.

Examples:

- P7 form creation declares the exact form-field total and exact per-page widget-count delta.
- Form flattening expects zero interactive fields and zero widgets on affected pages.
- Attachment cleanup expects zero attachments.
- Metadata removal expects core metadata to be cleared.
- JavaScript cleanup expects JavaScript to be absent.
- Removing automatic actions may remove JavaScript but may never introduce it.
- Password protection/removal declares the expected encryption state.

Affected pages may change semantically. Untouched sampled pages may not.

When source redaction annotations exist but their exact page locations are unavailable to the high-level inspection, P8 marks all pages affected for that redaction operation rather than claiming untouched-page coverage it cannot prove.

## Fail-closed publication

Editor and Secure outputs run P8 before download, native-file commit, project creation or prepared-snapshot publication.

If P8 reports a failure:

- no output is published;
- the original remains unchanged;
- the UI reports a P8 fidelity-validation failure;
- specialist writer validation remains intact and runs independently.

## Compatibility normalization

Byte identity is not required. P8 permits normal writer normalization such as:

- incremental revision collapse;
- object-stream packing changes;
- xref table/stream representation changes;
- linearization removal;
- compression/object-number changes.

These are surfaced as warnings when applicable.

## Persistence boundary

P8 introduces no persistent schema changes.

- IndexedDB remains schema 13.
- .lpsproject remains package version 9.
- Fidelity profiles/reports are operation-local evidence only.

## Acceptance

P8 is complete when:

1. Editor output is blocked on fidelity failure.
2. Secure/P7 output is blocked on fidelity failure.
3. intentional P7 form/encryption/sanitization changes use explicit expectations rather than broad bypasses.
4. untouched sampled pages remain semantically stable.
5. very large edit sets remain bounded and deterministic.
6. normalization warnings remain non-blocking when semantics pass.
7. compatibility corpus remains independently readable by external validation tools.
8. P1–P7 regression suites remain green.
9. frozen persistent formats remain unchanged.
10. typecheck, build, performance budget, release-freeze validation and browser regression pass.

## Handoff

After P8 is green, **P9 is release-candidate certification and defect-only hardening**. No new editing primitives should be introduced in P9.
