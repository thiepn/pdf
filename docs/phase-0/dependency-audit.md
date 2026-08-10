# Dependency Audit — Initial Pin Set

The package manifest pins exact versions during Phase 0 so that feasibility results are tied to a reproducible engine set.

| Package | Pinned version | Intended role | Licence status |
|---|---:|---|---|
| react | 19.2.8 | Diagnostic UI | MIT |
| react-dom | 19.2.8 | Browser rendering | MIT |
| vite | 8.1.5 | Build and static deployment | MIT |
| typescript | 5.9.2 | Static typing | Apache-2.0 |
| pdfjs-dist | 6.2.108 | Viewing, text extraction and search foundation | Apache-2.0 |
| mupdf | 1.28.0 | Mutable document engine and PDF serialization | AGPL-3.0-or-later or commercial |
| tesseract.js | 7.0.0 | Later OCR feasibility work | Apache-2.0 |
| vitest | 4.1.10 | Unit/integration testing | MIT |
| @playwright/test | 1.62.0 | Cross-browser testing | Apache-2.0 |

## Required before public release

1. Generate a full transitive dependency licence report from the installed lockfile.
2. Include the complete AGPL-3.0 licence text.
3. Confirm that all production source corresponding to the deployed build is public.
4. Confirm licences for all fonts, OCR language packs and test fixtures.
5. Remove any fixture whose redistribution rights are unclear.
