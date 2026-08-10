# Phase 2 build 0.5.0 audit

## Scope delivered

- Production Quick Tools route
- Direct PDF-to-organizer intake with password prompt
- Local multi-file merge
- Project page organizer
- Stable virtual page identities
- Selection expressions
- Drag-and-drop reorder
- Rotate, duplicate, delete, reverse, and extract
- Page-plan undo and redo
- Worker cancellation
- Worker-side MuPDF page grafting
- Metadata carry-over
- PDF.js structural reopening and page-count validation
- Download or create-new-project output paths
- Responsive desktop/mobile layouts

## Correctness checks completed

- Temporary strict TypeScript source-tree audit
- Relative import resolution audit
- Page-selection runtime tests
- Page-plan movement runtime tests
- Duplication runtime tests
- Rotation normalization runtime tests
- Last-page deletion guard runtime test
- Router source audit
- JSON parsing
- GitHub Actions YAML parsing
- Service-worker JavaScript syntax check
- CSS brace and layout structure check
- Placeholder/fake-control scan

## Defects found and corrected

1. Organizer grid originally used a fixed three-row layout despite optional banners. It now uses a flex column with a bounded scrolling page grid.
2. Encrypted projects could be imported but not reopened in the organizer. The organizer now requests an in-memory password and passes it to both engines.
3. Encrypted source export initially omitted MuPDF authentication. Worker authentication is now explicit.
4. Exclusion-only page expressions initially selected nothing. They now imply all pages before exclusions.
5. Worker buffer transfers could retain `ArrayBufferLike` ambiguity. Transfer buffers are now explicit copied `ArrayBuffer` instances.
6. Preservation warnings originally appeared only after processing. They are now visible before export controls are used.
7. Tool navigation did not remain active on the merge route. The Tools section now remains selected.
8. Organizer layout claimed virtualization. Documentation now accurately states lazy thumbnail rendering.

## Validation limitations

A real Vite build, Vitest execution, Playwright browser run, and live MuPDF WebAssembly operation could not be performed in this environment because the internal npm registry does not contain the pinned packages. GitHub Actions remains configured to perform the real dependency installation, typecheck, tests, and production build.

The local audit therefore establishes source-level correctness and executable correctness of dependency-free page-plan modules, but not final browser-engine compatibility.

## Preservation limitations

The Phase 2 worker creates a clean destination PDF and grafts pages into it. This approach avoids shared page-object mutation and enables isolated duplication, but does not yet guarantee preservation of:

- Document outlines/bookmarks
- Embedded attachments
- Cryptographic signatures
- Complex AcroForm field trees
- Document-level JavaScript and actions
- Incremental revision history

These limitations are visible in the application before export.

## Required next regression work

- Run CI against the real pinned dependencies
- Test Chrome, Firefox, and WebKit
- Validate annotations and form widgets with a controlled corpus
- Compare representative page renders before and after compilation
- Benchmark 500- and 1,000-page organizers
- Add persisted organizer recovery journals
- Add signed-document detection and stronger preflight warnings
