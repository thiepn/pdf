# Phase 4 — Secure Workflow

Phase 4 adds security-sensitive document operations on top of the Phase 3 editor. Ordinary visual editing remains non-destructive; destructive operations are isolated in a dedicated Secure workspace and always create a new output.

## Architecture

1. PDF.js opens and previews the source.
2. The security worker opens the same bytes through MuPDF.
3. Existing widgets, annotations, signatures, actions, attachments, permissions, metadata, and revision state are inspected.
4. Phase 3 editor objects are compiled first.
5. Form updates, redactions, sanitization, flattening, and encryption are applied in the document worker.
6. The output is reopened independently.
7. Security-specific semantic checks run.
8. Output is released only when all required checks pass.

## Persistence rules

- Security preferences are stored in the `securityStates` IndexedDB store.
- Project package format 3 includes non-secret security state.
- Source PDF passwords, output owner/user passwords, certificate data, and password-form-field values are never persisted.
- Destructive operations create a new PDF rather than overwriting the sole valid source copy.

## Deliberately deferred

- Arbitrary AcroForm field creation
- Browser-local certificate signing
- Certificate-chain validation
- Trusted timestamp authorities
- Universal repair of malformed security structures
