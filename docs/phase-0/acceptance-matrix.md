# Phase 0 Acceptance Matrix

| Gate | Critical | Status in build 0.0.1 | Exit evidence |
|---|---:|---|---|
| P0-01 Build and GitHub Pages | Yes | Implemented; requires CI run | Successful clean GitHub Actions deployment and browser report |
| P0-02 PDF.js viewer | Yes | Initial implementation | Fixture and corpus renders, text geometry, cancellation and cleanup results |
| P0-03 MuPDF engine | Yes | Initial implementation | Worker load, round-trip PDF, reopen validation |
| P0-04 Coordinates | Yes | Not started | Matrix tests under rotation, crop, zoom and DPR |
| P0-05 Export validation | Yes | Initial dual-engine reopen implemented | Complete structure, render sampling and operation-specific semantic checks |
| P0-06 Page operations | Yes | Not started | Deterministic page commands and validated outputs |
| P0-07 Annotations | Yes | Not started | Persistence and external-reader appearance |
| P0-08 Redaction | Yes | Not started | Known markers irrecoverable after full rewrite |
| P0-09 Forms | No | Not started | Value, appearance, merge conflict and flatten tests |
| P0-10 OCR | No | Not started | Searchable aligned text, offline language assets |
| P0-11 Large documents | Yes | Not started | Bounded canvases, memory cleanup and cancellation |
| P0-12 Storage/recovery | Yes | Primitive tests implemented | Interrupted atomic snapshot and recovery tests |
| P0-13 Browser matrix | Yes | Capability probe implemented | Recorded Chrome, Firefox and Safari results |
| P0-14 Encryption | No | Not started | Open/protect/unlock round-trips |
| P0-15 Signatures | No | Not started | Local test certificate sign/verify result |
| P0-16 Text editing | No | Not started | Safe capability classification and fallback |
| P0-17 Workers | Yes | Initial implementation | Cancellation, restart and failure isolation |
| P0-18 Licensing | Yes | Initial dependency table | Complete AGPL and third-party distribution audit |
