# Phase 9 — Production Validation and Release Engineering

Phase 9 converts the release criteria from documentation into executable checks. It does not add a new document-processing family. Its purpose is to prove that the current deployment can actually load both PDF engines, create workers, use browser-local persistence, validate project backups, operate its service worker, and avoid unexpected cross-origin resource requests.

## Runtime validation

The `#/validation` route performs a disposable local test using generated fixture data. It exercises:

1. Secure-context and browser capability checks
2. Dedicated worker startup
3. PDF.js parsing and text extraction
4. MuPDF parsing and clean serialization
5. Coordinate round trips for all page rotations
6. IndexedDB, OPFS, and Cache API writes and cleanup
7. Project backup integrity and corruption rejection
8. Service-worker activation and version reporting
9. Observed external-resource origins

No personal document is required or uploaded.

## Release engineering

- `npm run audit:source` validates repository invariants without external packages.
- `npm run build:verified` builds the app, enforces distribution budgets, and writes `release-integrity.json`.
- CI executes source checks, semantic type checking, unit tests, build verification, dependency auditing, and browser regression.
- Deployment performs a post-Pages smoke check.
- Version tags create draft GitHub releases with source archives, deployable output, and SHA-256 checksums.

## Boundary

The runtime self-test validates the deployed foundation, not every PDF variant. External-reader, print, mobile, performance, malformed-file, and adversarial security corpora remain mandatory before stable publication.
