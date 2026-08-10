# Build report — 4.1.0-phase17

## Scope

Phase 17 consolidates existing PDF-content editing and Local PDF Studio overlay editing into one Edit workspace. It does not claim universal arbitrary content-stream editing. Every detected source object carries an explicit capability level and the export pipeline continues to create/validate derived output under the Phase 16 revision and transaction model.

## Implemented editor surface

- Existing text, image regions, supported simple vectors, detected tables, and supported AcroForm widgets are selectable from the main Edit canvas and Layers panel.
- Latin text uses bounded static reconstruction. Korean, Japanese, Simplified Chinese, and Traditional Chinese can use MuPDF CJK CID fonts or an optionally supplied compatible font.
- Complex-script text is disclosed as appearance-only; unsafe complex-script table reconstruction is refused.
- Image replacements support contain/cover/stretch and independent destination geometry while permanent source removal stays tied to the detected original bounds.
- Supported simple vectors can be restyled, transformed, or removed after explicit Fitz/PDF coordinate conversion.
- Supported form fields retain native widget interactivity while changing field values.
- The legacy Native Edit route is preserved only as a compatibility redirect into Edit.

## Validation completed in this environment

- Phase 16 runtime regression: 4/4 checks passed.
- Phase 17 runtime regression: 10/10 checks passed.
- Phase 11 dependency-independent runtime regression: 15/15 checks passed.
- Phase 11 external-reader corpus: 11/11 PDF fixtures passed independent validation.
- Offline internal TypeScript semantic check: passed.
- Phase 17 native core strict TypeScript compile against a minimal MuPDF declaration stub: passed.
- Modified TS/TSX parser/transpilation check: passed.
- Source audit: 448 relative imports resolved across 150 source files; no production TODO/FIXME/fake-control markers.

## Remaining stable-release gates

The official dependency install, committed lockfile, Vite production build, Vitest execution, real MuPDF/WASM browser integration, and Chromium/Firefox/WebKit Playwright matrix remain mandatory for a stable designation. The configured npm mirror in this execution environment returns 404 responses for pinned packages (first `@playwright/test@1.62.0`, then `@types/react@19.2.17` when Playwright was temporarily excluded); an earlier public-registry attempt also timed out. No stable-pass claim is made for those gates.
