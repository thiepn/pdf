# Security Policy

## Supported release

Security fixes target the current v6.1.0 release candidate and the qualified v6.1.0 Stable build after publication.

## Security model

- Documents are processed locally in the browser.
- Embedded PDF JavaScript and launch actions are not executed by default.
- Passwords remain in memory and are excluded from IndexedDB, OPFS project metadata, `.lpsproject` packages, and diagnostic records.
- Security-sensitive exports are reopened and checked before they are released.
- Redaction is treated as a destructive two-stage operation and uses a clean full save.
- Attachments and external links are treated as untrusted content.
- The application uses a restrictive Content Security Policy compatible with its local workers and WebAssembly engines.

## Reporting a vulnerability

Do not include private documents, passwords, certificates, or document text in a report. Provide a minimal synthetic fixture, the browser and version, exact steps, expected behavior, actual behavior, and whether the issue affects exported files or only the interface.

## Out of scope claims

The project does not claim password cracking, certified PDF/A validation, universal signature-chain verification, or safe execution of arbitrary PDF JavaScript.

## Release validation

Every deployment should run the in-app release validation and attach the exported report to release evidence. A failed PDF-engine, worker, backup-integrity, storage, or service-worker check blocks stable publication for that environment.

## Phase 10 operational evidence

Output activity receipts store SHA-256 checksums and metadata locally. They are not digital signatures and do not establish identity or a trusted signing time. Support bundles exclude PDF bytes, OCR text, editor content, and password fields; output filenames are excluded unless the user explicitly enables them. Safe mode prevents automatic project reopening and service-worker registration for the current tab.

## Phase 11 release evidence

Phase 11 adds deterministic adversarial fixtures for permanent redaction, encrypted input, malformed input, and incremental revisions. The automated corpus confirms that known redaction markers and sensitive title metadata are absent from the cleaned fixture through two independent readers. This evidence supplements—but does not replace—the browser, raw-object, external-reader, and manual attack matrices required before a stable tag.

## Phase 15 signature handling

Detached signature private keys are generated for the current action, remain in WebCrypto memory, are never persisted, and are not included in project packages or support bundles. The exported evidence contains only the public key, signature, checksum, filename, and timestamp.


## Phase 30 final security gate

The v6.1.0 stable workflow must pass the Phase 30 source security/privacy audit, dependency high-severity audit, exact lockfile/toolchain audit, full PDF regression corpora, exact-artifact browser matrix, and deployed GitHub Pages smoke test. Stable publication is blocked if any of those gates fail. Cross-origin runtime network access is limited by CSP to the explicit user-triggered Project Naptha OCR language-pack source; support bundles do not load project document content, and PDF passwords are blanked before persisted security state or project-package encoding.
