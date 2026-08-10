# Phase 1 — Application Foundation

## Implemented scope

- Production application shell and routes
- Local PDF import pipeline
- Project manifest schema v1
- OPFS source storage with IndexedDB fallback
- Project checksums and duplicate detection
- Recent projects, rename, deletion, backup, and restore
- PDF.js single-page viewer
- Lazy continuous rendering
- Lazy thumbnails
- Search, bookmarks, page labels, and metadata
- Persistent viewer state
- Password-per-session flow
- Storage quota inspection
- Multi-tab project lease foundation
- Offline service-worker shell
- Diagnostics access to Phase 0 laboratories

## Remaining Phase 1 hardening

- Interactive PDF form layer
- Rich annotation/link overlay rather than rendered appearances only
- Search-result geometry spanning split PDF text items
- Persisted optional search index
- More rigorous large-document cache limits
- Automated browser testing with the real dependency installation
- Full crash-injection and interrupted-write tests

## Phase 1 exit status

This build is a technical preview, not a completed Phase 1 exit candidate. It establishes the product surface and project lifecycle required for further reliability and performance work.
