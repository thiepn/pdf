# Build 0.1.0 Phase 1 Audit

## Architecture added

- Production application router and shell
- Project manifest schema v1
- OPFS file storage with IndexedDB fallback
- Project checksum/deduplication pipeline
- Binary project backup format
- PDF.js viewer, search, text layer, outline and metadata surfaces
- Persistent viewer preferences
- Lazy thumbnail and page-render components
- Project storage inspection
- Multi-tab lease foundation
- Phase 1 PWA cache namespace

## Static validation

- Strict TypeScript audit completed using dependency declarations because the execution environment could not install npm packages.
- CSS block balance verified.
- JSON manifests and configuration parsed successfully.
- Phase 0 diagnostics remain reachable under the production application.

## Environment limitation

The provided environment's npm proxy did not contain the exact dependency versions in `package.json`; therefore a real Vite bundle, Vitest run, and Playwright run were not possible locally. GitHub Actions remains configured to run those checks in a normal npm environment.

## Known incomplete Phase 1 items

- PDF.js text-layer geometry needs corpus validation.
- Interactive form widgets and annotation panels are not yet implemented.
- Continuous view uses lazy canvases but one lightweight observer shell per page.
- Full crash-injection and storage-eviction regression tests remain pending.
