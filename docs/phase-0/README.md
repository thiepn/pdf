# Phase 0 — Engineering Laboratory

Phase 0 is a disposable diagnostic application used to prove the architecture before production editing workflows are built.

## Implemented gates

| Gate | Current implementation | Evidence produced |
|---|---|---|
| P0-01 Deployment | Vite base-path resolution, hash routing, service worker, capability checks, module-worker handshake | Downloadable browser diagnostic JSON |
| P0-02 PDF.js viewer | File/fixture loading, rendering, zoom, page navigation, cancellation, text extraction | Canvas render, timing, extracted text, byte validation |
| P0-03 MuPDF engine | Dedicated worker, document opening, metadata/text extraction, clean save round-trip | Output PDF, timing and page data |
| P0-05 Export validation | Basic bytes plus independent PDF.js reopen of MuPDF output | Page-count and extracted-text comparison |
| P0-12 Storage | IndexedDB record round-trip, OPFS 1 MiB binary round-trip, quota and persistence probes | Downloadable storage diagnostic JSON |

## Not implemented yet

- P0-04 coordinate-system harness
- P0-05 complete operation-specific semantic validator
- P0-06 page mutation commands
- P0-07 annotation persistence
- P0-08 destructive redaction validation
- P0-09 forms
- P0-10 OCR
- P0-11 large-document benchmark harness
- P0-13 full cross-browser evidence matrix
- P0-14 encryption
- P0-15 cryptographic signatures
- P0-16 existing-text edit classification

## Development rule

Production interface work must not begin until coordinate transforms, export validation, page mutation, storage recovery and large-file behavior have passed their critical gates.
