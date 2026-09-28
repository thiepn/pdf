# Third-party notices

Dependency versions are pinned in `package.json` and `package-lock.json`. Every production build generates `license-inventory.json` from the installed, lock-verified packages, instead of maintaining a second version list here.

The distribution includes the application licence in `LICENSE.txt` and verbatim upstream licence/notice texts in `THIRD_PARTY_NOTICES.txt`. The inventory records package versions and SHA-256 hashes of the upstream texts. It includes the direct browser libraries, their browser-side helpers, and the attribution files supplied with the prebuilt Tesseract client and worker. Node-only and optional native dependency packages are not represented as browser runtime libraries.

| Library | Upstream licence |
|---|---|
| React, React DOM and Scheduler | MIT |
| PDF.js / pdfjs-dist | Apache-2.0 |
| MuPDF.js | AGPL-3.0-or-later or a separately obtained commercial licence |
| Tesseract.js and Tesseract.js Core | Apache-2.0 |

MuPDF licensing covers its JavaScript wrapper and underlying WebAssembly library. The application remains distributed under the repository's AGPL licence; corresponding source and build instructions are available in this public repository and its source release archives. No commercial MuPDF licence is implied.

OCR language data is not bundled in the source archive. Users may explicitly download compatible `.traineddata.gz` files from the configured Project Naptha tessdata host or import their own local language pack. Redistributors who prebundle language files must review and retain the applicable tessdata licence and attribution for each included file.

## Phase 11 validation-only tools

The release-engineering corpus may be generated and validated with PyMuPDF and pypdf. These Python tools are development/test dependencies listed in `requirements-phase11.txt`; they are not bundled into the browser distribution.

## Bundled sRGB ICC profile

`public/color/srgb-artifex.icc` is the Artifex Software sRGB ICC profile distributed with the system Ghostscript/Artifex color-profile assets. It is bundled locally so Phase 19 archival-candidate generation does not require a network request. The profile remains subject to its upstream Artifex licensing terms.
