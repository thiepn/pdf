# Third-party notices

This Phase 7 professional-suite candidate declares the following pinned direct dependencies. A release build must retain applicable licence texts and verify the complete transitive dependency tree after installation.

| Package | Version | Licence |
|---|---:|---|
| React | 19.2.8 | MIT |
| React DOM | 19.2.8 | MIT |
| Vite | 8.1.5 | MIT |
| PDF.js / pdfjs-dist | 6.2.108 | Apache-2.0 |
| MuPDF.js | 1.28.0 | AGPL-3.0-or-later or commercial licence |
| Tesseract.js | 7.0.0 | Apache-2.0 |
| Tesseract.js Core | 7.0.0 | Apache-2.0 |
| TypeScript | 5.9.2 | Apache-2.0 |
| Vitest | 4.1.10 | MIT |
| Playwright | 1.62.0 | Apache-2.0 |

OCR language data is not bundled in the source archive. Users may explicitly download compatible `.traineddata.gz` files from the configured Project Naptha tessdata host or import their own local language pack. Redistributors who prebundle language files must review and retain the applicable tessdata licence and attribution for each included file.

## Phase 11 validation-only tools

The release-engineering corpus may be generated and validated with PyMuPDF and pypdf. These Python tools are development/test dependencies listed in `requirements-phase11.txt`; they are not bundled into the browser distribution.

## Bundled sRGB ICC profile

`public/color/srgb-artifex.icc` is the Artifex Software sRGB ICC profile distributed with the system Ghostscript/Artifex color-profile assets. It is bundled locally so Phase 19 archival-candidate generation does not require a network request. The profile remains subject to its upstream Artifex licensing terms.
