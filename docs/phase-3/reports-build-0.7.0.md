# Build Audit — 0.7.0-phase3

## Scope inspected

- Editor object and history models
- IndexedDB schema and migrations
- Binary asset persistence
- Project package v2 encoding and decoding
- Editor routing and production integration
- Canvas/SVG coordinate mapping
- Pointer interaction and selection
- MuPDF export worker
- PDF.js reopening and annotation validation
- Responsive CSS structure
- Unit and browser test sources

## Checks passed in the available environment

- Strict TypeScript source-tree audit using temporary declarations for unavailable packages
- Relative import resolution audit
- JavaScript service-worker syntax check
- JSON and GitHub Actions YAML parsing
- CSS delimiter audit
- Runtime checks for object creation, markup variants, grouped duplication, history, routes, snapping, and package binary round trips
- Project archive preparation audit

## Defects found and corrected

1. Image deletion removed the binary asset and broke undo.
2. Cross-project clipboard data could create image objects without bytes.
3. Project-package asset offsets trusted stale metadata rather than actual buffers.
4. Imported tall images could exceed the page.
5. Export reports counted missing image assets as successful.
6. Export validation checked only page count and not object persistence.
7. Annotation print flags were not explicit.
8. The editor type union included non-serialized pseudo-types.

## Environment limitation

The configured internal npm registry does not provide the pinned package versions. Therefore, a real `npm install`, Vite production build, Vitest execution, and Playwright browser run could not be completed locally. The repository workflows are configured to run these checks in a normal npm environment.

## Release decision

- Phase 3 implementation core: **accepted as beta source**
- Phase 3 full exit gate: **not yet passed**
- Public stable designation: **not approved**
