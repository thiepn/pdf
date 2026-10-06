# P12 — v7.2 Product Roadmap & Feature Intake

P12 turns the P11 v7.2 development-line boundary into an explicit product roadmap. It does **not** cut the executable version to 7.2.0, publish v7.1.4, or reopen the frozen P9/P10 release evidence.

## Objective

Define what belongs in v7.2 using the current product boundary, known limitations, everyday-workflow gaps, and release-quality obligations.

The roadmap must prefer work that:

1. materially improves common PDF jobs;
2. preserves the local-first/privacy model;
3. closes fidelity or reliability gaps instead of adding decorative surface area;
4. is feasible in the browser without pretending low-fidelity approximations are equivalent to desktop/server products;
5. has measurable acceptance criteria before implementation starts.

The machine-readable source of truth is `docs/p12/feature-intake.json`.

## Committed v7.2 roadmap

### V72-01 — Visual page composition

Make page surgery genuinely visual and direct:

- drag-to-crop;
- insert or replace arbitrary pages from another PDF;
- duplex scan interleaving;
- mixed-source visual merge and reorder;
- preview-first output before download.

This closes a common-workflow gap without changing the core storage formats.

### V72-02 — Original-page OCR fidelity

Move beyond searchable raster reconstruction:

- preserve original page appearance;
- add an aligned invisible/searchable text layer;
- review OCR boxes before commit;
- expose confidence/errors without forcing a full raster derivative;
- preserve the original PDF wherever the source structure allows it.

The project must continue to avoid handwriting-recognition claims.

### V72-03 — Preservation-aware page surgery

Page insert/delete/reorder/split/merge must account for document-level structures:

- bookmarks/outlines;
- links and destinations;
- AcroForm fields/widgets;
- attachments and metadata relationships;
- signature invalidation warnings.

The acceptance goal is not “all structures always survive”; it is deterministic preservation where supported and explicit fail-closed disclosure where not.

### V72-04 — Searchable compression and target-size optimization

Improve compression without using rasterization as the universal answer:

- image recompression while preserving searchable text/vector structures where possible;
- target-size mode with bounded iterations;
- before/after size and preservation summary;
- refusal to claim success when the requested size cannot be reached safely.

### V72-05 — Batch parity and encrypted-input ergonomics

Bring high-value standalone tools into reusable Batch recipes and close encrypted-queue gaps:

- broader tool parity;
- per-file password handling that stays session-local;
- deterministic stale-output invalidation;
- multi-output semantics only where the recipe/result model can represent them clearly.

### V72-06 — Compatibility and field qualification expansion

Increase confidence on real PDFs rather than only generated fixtures:

- real-world malformed/scanned/form-heavy/encrypted/signed corpus;
- very large document cases;
- external-reader checks;
- phone/tablet/installed-PWA checks;
- regression evidence for the v7.2 committed capabilities.

This is release-quality work and may not be skipped merely because feature tests pass.

## Candidate spikes

These are useful but not committed until evidence justifies the cost and risk.

### V72-C1 — Complex-script shaping and bidi editing

Investigate static reconstruction for Arabic/RTL and other shaping-dependent scripts. Promotion requires a shaping/bidi architecture, font-subsetting story, and fidelity corpus.

### V72-C2 — Layout-aware DOCX interchange

Investigate a meaningful layout-aware DOCX path for text, paragraphs, tables, images, and common equations. A text-only exporter is not enough evidence. Any server/upload dependency requires a separate privacy/retention/cost decision.

### V72-C3 — Dedicated touch document zoom

Investigate a controlled two-pointer PDF canvas zoom model only if it improves mobile editing without fighting native browser viewport zoom or accessibility.

## Explicitly deferred from v7.2

P12 does not commit:

- full bidirectional DOCX/XLSX/PPTX conversion;
- browser certificate-store/PAdES signing;
- automatic full PDF/UA semantic reconstruction from arbitrary visual PDFs;
- unrestricted arbitrary PDF content-stream rewriting;
- desktop companion, HSM/PKCS#11, enterprise fleet, or zero-trust platform work.

These are not forbidden forever. They are excluded from this release because they would expand risk, dependencies, or product complexity beyond the v7.2 consumer objective.

## Intake rule

A new v7.2 feature may not become committed scope merely by being requested. Intake must record:

- concrete user outcome;
- evidence/source gap;
- privacy/local-first effect;
- compatibility and data-loss risk;
- measurable acceptance criteria;
- migration/schema impact;
- disposition: committed, candidate, or deferred.

Changes to the committed set require updating the intake manifest and passing the P12 audit.

## Release-line guardrails

P12 preserves all P11 constraints:

- executable version stays `7.1.4` while the line is pre-cut;
- target remains `7.2.0`;
- P9/P10 v7.1.4 evidence is not repurposed;
- project package / database / native editor schemas remain 9 / 13 / 6;
- the future version cut still requires the real P10 post-release certificate and must be atomic.

## Definition of Done

P12 is complete when:

1. every known candidate has an explicit disposition;
2. committed scope is ordered and bounded;
3. every committed item has measurable acceptance criteria;
4. deferred high-risk work cannot silently enter v7.2;
5. the P11 release-line and schema invariants remain unchanged;
6. the roadmap is machine-audited in CI.

## What's next

**P13 — Visual Page Composition & Page Surgery UX**

P13 should implement V72-01 without broadening into unrelated conversion or release-promotion work.
