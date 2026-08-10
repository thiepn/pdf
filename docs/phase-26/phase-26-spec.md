# Phase 26 — Workflow Intelligence & Automation 3.0

## Goal

Improve the browser-native workflows introduced in Phase 25 without changing the local-first GitHub Pages/PWA architecture.

## Product constraints

- No backend, cloud renderer, or required desktop runtime.
- All document analysis and output remain local to the browser.
- GitHub Pages repository-subpath deployment remains supported.
- Heavy operations remain bounded by the Phase 21 operation/storage model where they operate on projects.
- Browser performance boundaries and destructive/raster boundaries must remain explicit.

## Workstream 1 — Compare 3.0 hybrid page alignment

Phase 25 page sequence alignment relied on extracted text. Phase 26 adds a low-resolution perceptual visual fingerprint for pages with little extractable text. Sequence alignment combines text and visual similarity so image-only/scanned inserted or deleted pages can be represented explicitly rather than shifting all subsequent comparisons.

Text remains the primary signal when both pages contain reliable text. Visual fingerprints are deliberately small and ephemeral; rendered comparison thumbnails are released immediately after fingerprint extraction.

## Workstream 2 — Create PDF Studio 2.0

Carry common inline formatting through parsing, pagination, preview, and PDF output:

- bold;
- italic;
- bold-italic;
- inline code;
- safe `http`, `https`, and `mailto` links.

Searchable output uses separate PDF text commands/font roles and emits link annotations for safe links. Visual compatibility output renders the same inline appearance through browser shaping but remains a raster PDF and therefore does not claim interactive links/searchable text.

Semantic HTML import carries supported inline `strong/b`, `em/i`, `code`, and safe `a` semantics while continuing to strip scripts, styles, iframes, objects, embeds, templates, and other active content.

## Workstream 3 — Batch 3.0

Upgrade recipe schema from v2 to v3 and add terminal multi-output nodes:

- **Split into PDF parts** — fixed pages per part, output packaged as ZIP;
- **Page images** — compact/balanced/high PNG page export packaged as ZIP.

Multi-output nodes must be terminal because subsequent linear recipe steps cannot safely operate on branched outputs. The UI inserts ordinary steps before a terminal node and replaces an existing terminal node when another terminal node is selected. Portable recipe import enforces the same rule.

## Validation

- dependency-independent Phase 26 runtime regression;
- unit tests for hybrid similarity, inline parsing/layout, schema migration, and terminal-step validation;
- Playwright coverage for creator inline preview, Compare 3.0, and Batch 3.0 entry points;
- source-audit integration;
- Phase 26 execution in CI, Pages deployment, tagged release, and stable-web release scripts;
- complete historical Phase 16–26 runtime and Phase 11 corpus regression.
