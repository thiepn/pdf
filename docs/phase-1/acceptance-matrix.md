# Phase 1 Acceptance Matrix

| Gate | Status | Evidence / limitation |
|---|---|---|
| Production application shell | Pass | Home, Projects, Viewer, Settings, Storage, Diagnostics routes implemented |
| Local PDF import | Pass (static audit) | Validation, PDF.js inspection, checksum, OPFS/IndexedDB storage |
| Password-protected import | Partial | Session-only password flow implemented; browser corpus test pending |
| Single-page viewer | Pass (static audit) | PDF.js canvas and selectable text overlay |
| Continuous viewer | Partial | Lazy rendering and distant-canvas release; one lightweight observer shell per page |
| Thumbnails | Pass (static audit) | IntersectionObserver lazy rendering |
| Search | Pass (static audit) | Page-chunked search, progress, cancellation, snippets, page navigation |
| Bookmarks/page labels | Pass (static audit) | PDF.js outline and destination resolution |
| Metadata/field inspection | Pass (static audit) | Metadata, field count, attachments, JavaScript presence |
| Interactive form layer | Not implemented | Required before Phase 1 exit candidate |
| Annotation interaction | Not implemented | Existing annotation appearances remain part of page rendering |
| Viewer-state recovery | Pass | IndexedDB page, zoom, view mode, sidebar state |
| Project backup/restore | Pass | Versioned binary `.lpsproject` package and pure runtime round-trip |
| Multi-tab ownership | Partial | Lease/heartbeat foundation; conflict UI is informational |
| Offline shell | Partial | Service worker implemented; real production-build smoke test pending |
| Large-document discipline | Partial | Lazy canvases and thumbnails; benchmark corpus pending |
| Browser matrix | Pending | Requires real dependency installation and Playwright/browser devices |
| GitHub Pages workflow | Pass (configuration audit) | CI/build/deploy workflows updated for Phase 1 |
