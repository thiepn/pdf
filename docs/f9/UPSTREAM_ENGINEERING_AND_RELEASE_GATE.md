# F9 — PdfCraft-inspired independent export qualification

**Origin:** [storytold/pdfcraft](https://github.com/storytold/pdfcraft), public repository inspected 2026-10-09. Its independent-reader testing pattern informs this work; no source files, branded assets, fonts or icons have been copied. Upstream code uses MIT/Apache-2.0 options; third-party asset and brand conditions remain separate. PDF Studio retains its React/TypeScript/MuPDF architecture, AGPL distribution and local-first document handling.

## Implemented F9 slice

- `tests/e2e/f9-export-roundtrip.spec.ts` creates an actual rectangular PDF editor change on two existing P8 corpus PDFs and downloads the generated PDF. A test that did not reach the browser download cannot supply its export artifact.
- `scripts/f9/validate_export_roundtrip.py` reopens those exact exports with pypdf and independent qpdf/Poppler tools. It verifies structural integrity, page count, page geometry (including nonzero crop/rotation), preserved source annotations, original text extraction and ability to render the first page. A rectangle-only edit must not rewrite the original text. Absent exports or tools fail closed.
- `scripts/f9/test_validate_export_roundtrip.py` verifies that missing exports and tools never certify as success.
- `.github/workflows/f9-cross-reader-fidelity.yml` runs on a draft PR and stores artifact bytes and machine-readable evidence for review; it does not upload user documents, replace screenshot goldens, approve releases, merge or deploy anything.

## Scope and unresolved risks

This adds **two concrete real-export regressions**, not a claim that every PDF or all PdfCraft features are supported. F5–F8B existing implementation is unchanged. D18/D19 browser-native image fidelity and the F8B first-party Account activation are separate open qualification tracks; F9 does not supersede either. Must re-run **all** inherited exact-head F-series gates and the F9 focused test, review source corpus fidelity and licensing, then obtain human-only device/accessibility/Account and release approvals before any promotion. Failures must be repaired at their source; no test weakening or golden replacement.

## Follow-up F10 — Broader corpus and real feature-gap integration (not started)

1. Add validated browser exports from forms, annotations/measurements, optimization and F6 batch flows, checking source-specific invariants with independent readers.
2. Review PdfCraft's feature-gap list against **actual** PDF Studio behavior; pick one missing user-facing capability backed by a real consumer task, rather than porting Rust wholesale.
3. Add malformed/encrypted and interrupted-worker handling, verify offline/browser restoration, and capture cross-browser evidence without confusing generated inputs with actual outputs.
4. Reconcile F9 with the D-series branch stack using a reviewed integration PR rather than force-merging histories. Keep release, SSO client registration and baseline approvals human-gated.
