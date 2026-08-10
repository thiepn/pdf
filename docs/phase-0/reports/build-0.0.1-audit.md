# Phase 0 Build 0.0.1 — Local Audit

## Implemented

- React/Vite/TypeScript multi-file repository
- GitHub Pages CI/deployment workflows
- Static hash routing
- PWA manifest and runtime service worker
- Browser capability diagnostics
- Generic module-worker handshake
- PDF.js viewer with local file input, generated fixture, page navigation, zoom, render cancellation, password retry and text extraction
- MuPDF dedicated-worker probe with explicit WASM object cleanup
- MuPDF clean save followed by basic byte validation and independent PDF.js reopen
- Canonical affine coordinate service and 24 rotation/zoom round-trip groups
- OPFS and IndexedDB storage probes
- Full AGPL-3.0 licence text and initial third-party table
- Unit and Playwright smoke-test sources

## Checks completed in the build environment

- TypeScript source syntax and strict local typing checked with temporary dependency declarations
- Project-reference `tsc -b` configuration checked with temporary dependency declarations
- Core coordinate/fixture/validator modules compiled and executed with Node
- 24 coordinate groups passed round-trip tolerance checks
- Generated 671-byte fixture passed the internal PDF byte validator
- Generated fixture opened through an independent Python PDF parser as one page
- Fixture text extracted correctly by the independent parser
- `package.json` and web manifest parsed as JSON
- GitHub Actions files parsed as YAML
- CSS parsed through PostCSS
- HTML structure parsed and required root/module script confirmed
- Service-worker JavaScript passed `node --check`

## Not verified locally

The execution environment could not access the public npm registry. Consequently, the following remain to be verified by the included GitHub Actions workflow or a normal local Node environment:

- Real dependency installation
- Production Vite bundle
- Actual browser loading of PDF.js worker assets
- Actual browser loading of MuPDF WebAssembly assets
- Playwright browser execution
- GitHub Pages service-worker scope

## Next development gates

1. Complete P0-05 operation-specific export validator
2. Implement P0-06 page mutation commands
3. Connect P0-04 transform tests to real PDF.js and MuPDF page geometry
4. Implement interrupted atomic OPFS snapshot recovery
5. Add fixture corpus and large-document benchmark harness
