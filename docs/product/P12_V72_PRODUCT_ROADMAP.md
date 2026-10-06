# P12 — v7.2 Product Roadmap & Feature Intake

P12 turns the P11 v7.2 development-line boundary into a bounded product roadmap. It does **not** cut the executable version to 7.2.0, publish v7.1.4, or reopen frozen P9/P10 release evidence.

## Objective

Choose only net-new work that materially improves PDF Studio after the v7.1.4 product line.

P12 is deliberately conservative about old gap documents. A feature is not a v7.2 gap merely because an older roadmap says it was missing. Current source, current release documentation, and the P1–P8 product contracts take precedence.

The machine-readable source of truth is `docs/p12/feature-intake.json`.

## Baseline correction

The current product already includes capabilities that older documents still describe as future work:

- **Visual page composition is shipped.** v7.1 includes mixed PDF/image assembly, insert/replace, duplex interleaving, blank pages, visual crop, ordering, and undo/redo.
- **Source-preserving OCR 2.0 is shipped.** P3 keeps original page artwork, stores reviewable recognition evidence, and appends positioned invisible searchable text.
- **Intent-aware fidelity gating is shipped.** P8 blocks publication when unrelated document structure or untouched sampled content regresses.

P12 records these capabilities as `alreadyShipped`; they may be hardened by future defects, but they are not new roadmap items.

## Product principles

v7.2 work must:

1. improve a concrete PDF job rather than expand generic platform surface;
2. preserve the browser-local/private processing model by default;
3. prefer fidelity over fake feature parity;
4. fail closed when preservation or reconstruction cannot be justified;
5. remain lazy/on-demand when a specialist capability would increase startup cost;
6. define measurable acceptance before implementation starts.

## Committed v7.2 roadmap

### V72-01 — Layout-aware editable PDF → DOCX export

The existing DOCX path is intentionally text-focused. v7.2 should produce a materially more useful editable Word document without pretending to offer universal Office round-trip fidelity.

Scope:

- paragraph and reading-order reconstruction;
- page breaks and section geometry where deterministically available;
- common tables;
- embedded page images and extracted images with stable ordering/anchoring;
- common text styling when source evidence is reliable;
- explicit warnings for unsupported or ambiguous layout.

Acceptance requires the conversion to remain local/offline. Exact visual identity is not the contract; materially useful editable structure is.

### V72-02 — Complex-script existing-text editing

Current static reconstruction is strong for the qualified Latin/CJK paths but shaping-dependent scripts remain bounded.

v7.2 should add a real shaping/bidi path for supported complex scripts rather than extending appearance-only fallbacks.

Scope:

- Arabic/RTL as the first required family;
- Unicode bidi ordering and shaping;
- glyph-coverage and font validation;
- embedded/subset font output where required;
- fixed-box and bounded layout-aware edit preflight;
- multilingual source/output fidelity fixtures.

The phase must define exactly which scripts are qualified. “Universal Unicode editing” is not an acceptable claim.

### V72-03 — Structure-preserving target-size compression

Compression currently offers lossless optimization or raster profiles. v7.2 should add a target-size workflow while preserving searchable/vector/interactive structures whenever feasible.

Scope:

- target byte/MB input with bounded optimization attempts;
- image recompression and safe structural optimization before raster fallback;
- explicit preservation summary;
- before/after size evidence;
- honest refusal when the requested target cannot be reached without crossing the selected preservation boundary.

A larger output or an unsafe lossy output must never be presented as a successful target-size result.

### V72-04 — Batch parity & encrypted-queue ergonomics

Batch 3.0 is useful but exposes only a subset of standalone operations and lacks a complete per-file encrypted-input flow.

Scope:

- a maintained capability matrix between standalone tasks and Batch steps;
- add the highest-value safely composable missing operations;
- session-only per-file password handling;
- deterministic output invalidation when recipe/input/credential-relevant state changes;
- explicit semantics for terminal/multi-output operations.

This work may evolve the Batch recipe schema only in a later implementation phase with an explicit migration. P12 itself changes no schema.

### V72-05 — Deep native-content fidelity

The unified editor is intentionally conservative around PDF constructs that are difficult to mutate safely. v7.2 should deepen those supported boundaries without promising arbitrary content-stream rewriting.

Target classes:

- image masks, clipping, blend behavior, and shared-image semantics;
- more complex vector graphics state, clipping, shadings, and patterns;
- merged/irregular table geometry;
- bounded paragraph flow across adjacent regions/columns where blocker relationships are deterministic.

Each promoted class requires a source/output corpus and fail-closed preservation rules. Unsupported constructs remain selectable/inspectable only when safe.

### V72-06 — Compatibility & human/device qualification

The v7.2 release must prove its new capabilities on difficult real-world inputs and representative devices/readers, not only generated fixtures.

Scope:

- malformed, scanned, form-heavy, encrypted, signed, multilingual, and large PDFs;
- external-reader reopen checks;
- physical phone/tablet/installed-PWA observations for affected workflows;
- exact artifact and build identity in qualification records;
- release blocking for unresolved compatibility/data-loss failures.

Automation may calculate evidence, but automated runs do not substitute for required physical-device observations.

## Candidate spikes

Candidate work may be researched during v7.2 but is not committed release scope until the intake manifest is deliberately changed with evidence.

### V72-C1 — DOCX → PDF import

Investigate a local structured Word-to-PDF path only after V72-01 proves the document model needed for meaningful DOCX handling. It must not degrade into screenshot/raster-only import while being labelled editable conversion.

### V72-C2 — Independent PDF/A validation integration

Investigate whether a local standards validator can turn current PDF/A candidate preparation into stronger conformance evidence without bloating the normal consumer runtime.

### V72-C3 — Dedicated two-pointer document zoom

Investigate a canvas-level pinch interaction only if phone/tablet evidence shows a real editing advantage without breaking browser/accessibility zoom behavior.

## Explicitly deferred from v7.2

P12 does not commit:

- bidirectional XLSX/PPTX conversion or broad Office-suite parity;
- browser certificate-store, PKCS#11/HSM, or PAdES signing;
- automatic full PDF/UA semantic reconstruction from arbitrary visual content;
- unrestricted arbitrary PDF content-stream rewriting;
- desktop companion, enterprise fleet, federation, or zero-trust platform expansion.

These may become future roadmaps only when a concrete user need and feasible product boundary justify them.

## Intake rule

A request becomes committed v7.2 scope only when the intake record contains:

- a concrete user outcome;
- current-source evidence that the capability is genuinely missing or insufficient;
- privacy/local-first impact;
- compatibility/data-loss risk;
- measurable acceptance criteria;
- schema/migration impact;
- disposition: committed, candidate, deferred, or already-shipped.

A stale historical gap cannot be promoted without re-checking current source.

## Release-line guardrails

P12 preserves all P11 constraints:

- executable version stays `7.1.4` while the line is pre-cut;
- target remains `7.2.0`;
- P9/P10 v7.1.4 evidence is not repurposed;
- project package / database / native editor schemas remain 9 / 13 / 6;
- the future version cut still requires the real P10 post-release certificate and must be atomic.

## Definition of Done

P12 is complete when:

1. current shipped capabilities are separated from genuine v7.2 gaps;
2. every intake item has an explicit disposition;
3. committed scope is ordered and bounded;
4. every committed item has evidence-backed acceptance criteria;
5. high-risk/deferred work cannot silently enter the release;
6. P11 release-line and schema invariants remain unchanged;
7. CI machine-checks the roadmap contract.

## What's next

**P13 — Layout-Aware PDF → DOCX Export 2.0**

P13 implements V72-01: replace the current text-only conversion ceiling with a local, editable, layout-aware DOCX export while keeping unsupported fidelity explicit.
