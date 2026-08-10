# Phase 16 — Canonical Document Reliability

Phase 16 is a correctness release. It intentionally prioritizes state isolation, deterministic recovery, document lineage, preservation verification, and concurrency safety over adding new PDF tools.

## Reliability model

A document transformation now follows a transaction-shaped flow:

```text
source project + source revision
        ↓
validated operation
        ↓
new derived project + immutable revision
        ↓
transaction commit
```

If the operation fails, the source project remains unchanged, any partially created derived project is removed, and the journal records a rolled-back transaction. If a browser interruption leaves a transaction in `preparing`, the next owner reconciles it against any already-created derived output before editing resumes.

Checkpoint/package restoration is a separate path and never checksum-deduplicates into the active project. Globally keyed editor assets are regenerated and image references are remapped per import, so multiple restored copies remain fully isolated.

## Multi-tab ownership

The unified workspace owns the lease for the entire project. Read and Inspect remain available in duplicate tabs; mutating modes are blocked until ownership can be acquired. Read-only Viewer sessions also suppress preference/timestamp persistence so they do not create low-level write races. Web Locks are used where supported, with a short-lived local fallback elsewhere.

## Preservation graph v2

Count-only preservation checks are replaced with category-level digests aggregated from semantic object fingerprints. This catches same-count substitutions and unexpected object modification while still respecting each operation's explicit `preserve`, `modify`, `remove`, or `unsupported` contract.

## Resumable OCR

An OCR result cache is reusable only when the complete recipe matches: selected pages, language list, preprocessing values, and OCR/render recipe version. Any change starts a fresh job instead of mixing differently processed pages.
