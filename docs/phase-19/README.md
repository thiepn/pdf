# Phase 19 — Professional Standards, Signatures & Print

Phase 19 turns the existing compliance/professional prototypes into an evidence-oriented professional layer while preserving the Phase 16 revision/transaction model.

## Architecture

1. Inspect the exact open PDF revision in a worker.
2. Build recursive findings for archival, accessibility, print, security, and signatures.
3. Apply only explicitly selected repairs/preparation to a copy.
4. Reopen the output and verify required structures survived serialization.
5. Commit the output as an independent derived revision.

## Standards posture

The application distinguishes **preparation** from **certification**. A PDF/A candidate can contain concrete archival structures (decryption, ICC OutputIntent, PDF/A XMP), but the UI still requires independent conformance validation. Likewise, accessibility grades describe observed semantic structure; an empty structure root is only `baseline`.

## Signature posture

Phase 19 inspects embedded signature fields and `/ByteRange` coverage locally. Cryptographic trust-chain/CMS/PAdES verification and certificate-backed embedded signing remain explicit integration boundaries. A typed signer bridge exists for future local/native signer implementations.

## Print production

Imposition supports A4/A3 sheets, metric margins/gutters, 2-up/4-up/booklet layouts, LTR/RTL booklet order, quality presets, crop marks, and registration marks. Because the current compositor rasterizes source pages, the UI discloses the resulting preservation loss.
