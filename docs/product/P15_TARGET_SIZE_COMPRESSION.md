# P15 — Structure-Preserving Target-Size Compression

P15 implements v7.2 roadmap item **V72-03** without changing the executable version from v7.1.4.

## Objective

Let a user request a concrete output size without pretending that every PDF can safely be forced to that size.

P15 treats file size as a constraint with an explicit preservation boundary:

1. try a structure-preserving PDF rewrite first;
2. only rasterize when the user explicitly permits it;
3. stop after a bounded number of attempts;
4. report target success, best effort, or refusal honestly.

## Target input

The Compression tool now accepts a target in bytes, KB, or MB.

Any positive byte target is accepted for an attempt. The target must be smaller than the source file; if the source already meets the requested size, P15 does not create a pointless rewritten copy. Very small targets may simply produce a best-effort result or refusal after the bounded attempts.

## Preservation preferences

### Keep PDF structure

This is the strict path. P15 runs the existing MuPDF optimization pass with structural cleanup, stream/image compression, optional metadata removal, and existing password handling.

If that output reaches the target, it is selected immediately. If it does not reach the target:

- rasterization is never attempted;
- the smaller structural output is offered as **best effort** when it is a real reduction;
- if the rewrite is not smaller than the source, the operation is refused.

### Prioritize the target

This path still starts with the same structure-preserving pass.

Only if that pass misses the target does P15 enter a bounded raster fallback ladder:

| Attempt | Raster DPI | JPEG quality |
| ---: | ---: | ---: |
| 2 | 200 | 0.84 |
| 3 | 165 | 0.78 |
| 4 | 135 | 0.68 |
| 5 | 105 | 0.56 |
| 6 | 80 | 0.44 |

The first result at or below the target is selected, so P15 keeps the highest tested raster fidelity that actually satisfies the requested size.

If none of the six total attempts reaches the target, the smallest output that is genuinely smaller than the source is exposed as **best effort**. If no attempt improves on the source, P15 refuses to offer a compressed result.

## Success semantics

P15 deliberately separates three outcomes.

### Target met

This label is allowed only when the output is strictly smaller than the source and at or below the requested target. A larger file is never labelled successful compression.

### Best effort

The target was not reached, but a real smaller output was produced inside the selected preservation boundary. The UI shows the actual output size and explicitly states that the target was missed.

### Refused

No qualified smaller output exists, the requested size is invalid/already met, or the selected preservation boundary prevents a usable result. No fake success file is produced.

## Preservation summary

For every target-size result the UI shows:

- source bytes;
- requested target bytes;
- selected/best output bytes;
- number of attempts;
- preservation mode.

A **structure-preserved** result keeps searchable text, vector page content, and interactive PDF objects as structural PDF content. As with any PDF rewrite, cryptographic signature validity is not guaranteed.

Before such an output is published, P15 reuses the existing **P8 fidelity gate** with no pages declared intentionally changed. The bounded validator checks sampled text digests, image/vector operations, annotations/links/widgets, page geometry, outlines, attachments, form-field count, JavaScript presence, page labels, core metadata intent, and encryption state. A failure blocks the target-size output instead of downgrading the claim to a warning.

A **rasterized** result explicitly reports that searchable text, vector content, forms, links, annotations, and signature interactivity are not preserved.

The existing first-page visual preview and output page-count validation remain part of the workflow.

## Performance boundary

Target-size compression is intentionally bounded. P15 does not run an unbounded quality search or repeatedly chase a byte-perfect answer.

At most six attempts are permitted:

- one structural rewrite;
- up to five progressively stronger raster fallbacks.

## Privacy and storage

All work remains browser-local:

- no upload service;
- no remote compression API;
- no persistent password storage;
- no new runtime backend;
- no schema migration.

Target-size settings are transient UI state. P15 does not change Batch recipes, project packages, IndexedDB, or native-editor state.

## Release boundary

P15 preserves the existing pre-cut v7.2 constraints:

- executable version: **7.1.4**;
- target version: **7.2.0**;
- \`.lpsproject\`: v9;
- IndexedDB: v13;
- native-editor schema: v6.

## What's next

**P16 — Batch Parity & Encrypted-Queue Ergonomics**

P16 implements V72-04: close high-value Batch capability gaps and add safe per-file session-only credential handling without silently changing recipe semantics.
