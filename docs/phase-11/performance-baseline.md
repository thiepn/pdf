# Phase 11 Independent-Reader Performance Baseline

These measurements validate the generated corpus in the current container. They are not browser performance claims.

| Engine | 200-page parse and full text extraction | Pages | Extracted characters |
|---|---:|---:|---:|
| PyMuPDF | 75.99 ms | 200 | 151,779 |
| pypdf | 405.55 ms | 200 | 151,579 |

## Interpretation

- The corpus can be generated and validated without excessive fixture size.
- Browser PDF.js/MuPDF performance remains a separate Playwright and deployed-build gate.
- Stable release evidence must record browser, operating system, CPU class, memory, cold/warm cache, and output checksum.
