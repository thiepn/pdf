# Phase 10 — Operational Maturity

Phase 10 converts the technically broad PDF suite into a more supportable product. It adds local output traceability, safe startup recovery, cache and service-worker maintenance, privacy-safe support evidence, and an offline help system.

## Output receipts

The shared download path records bounded local metadata:

- Filename
- MIME type
- Byte length
- SHA-256 checksum
- Timestamp
- Application route
- Release version

The receipt store does not retain document contents. Logging is optional and can be disabled in Settings. JSON and CSV exports deliberately opt out of recording themselves.

## Safe mode and maintenance

Safe mode is session-scoped. It prevents automatic project reopening and skips service-worker registration for the tab. The maintenance workspace can:

- Recalculate project checksums
- Repair safe metadata/orphan inconsistencies
- Clear application caches while retaining OCR language packs
- Unregister service workers
- Clear sanitized diagnostics
- Reset non-document settings
- Export a support bundle without PDF bytes, passwords, OCR text, or editor content

Checksum mismatches remain non-repairable and require a trusted project backup.

## User guidance

The bundled Help route provides searchable, offline instructions for privacy, organization, editing, permanent redaction, OCR, backup/restore, and safe-mode recovery. The global command palette provides direct keyboard navigation without increasing sidebar complexity.

## Release boundary

Phase 10 remains a release-candidate phase. Stable publication still requires official dependency installation, semantic compilation, unit tests, browser regression, deployment validation, and external compatibility/security corpora.
