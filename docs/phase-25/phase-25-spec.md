# Phase 25 — Advanced Web Capabilities

## Goal

Expand Local PDF Studio beyond editing existing PDFs while preserving the static GitHub Pages, local-first PWA architecture.

## Product constraints

- No backend or cloud renderer.
- No required desktop/native runtime.
- New workflows must function under GitHub Pages repository subpaths.
- Browser-safe output boundaries must be explicit instead of imitating unsupported Office/web layout fidelity.
- New settings use metric page geometry where physical dimensions are exposed.

## Workstreams

### 1. Create PDF Studio

Create PDFs from Markdown, plain text, or semantic HTML using one deterministic pagination model. Support A4, A5, and custom metric page sizes; margins; body typography; heading scale; paragraph spacing; headers; footers; page numbering; document metadata; and reusable local style presets.

Two output contracts are exposed:

- **Searchable text PDF:** static MuPDF text content for supported Latin/CJK paths.
- **Visual compatibility PDF:** browser-shaped page rendering embedded as raster PDF pages for maximum script compatibility, explicitly disclosing loss of searchable/selectable PDF text.

### 2. Compare 2.0

Extract local page text, build bounded page fingerprints, and sequence-align the two documents so inserted/deleted pages are explicit. Let users select any aligned pair for existing visual-pixel or extracted-text diffing.

### 3. Portable automation presets

Allow Batch 2.0 recipes to be exported/imported as JSON. Imported recipes receive new local IDs, are normalized to the current schema, validate every step type, and never carry document content or passwords.

### 4. Validation

Add pure unit coverage, dependency-independent Phase 25 runtime regression, browser creator E2E coverage, source-audit checks, and Phase 25 execution to CI/deploy/tagged-release workflows.
