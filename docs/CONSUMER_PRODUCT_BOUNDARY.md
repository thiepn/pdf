# PDF Studio Consumer Product Boundary

## Product goal

PDF Studio is a fast, private, local-first, ad-free PDF workspace for ordinary users. The default browser application should make it unnecessary to visit a separate PDF utility for common PDF work.

The browser product must prioritize:

1. PDF capability depth and fidelity.
2. Fast startup and responsive editing.
3. Local/private processing.
4. Desktop, tablet, and mobile usability.
5. Reliability on malformed, large, scanned, encrypted, signed, and form-heavy PDFs.

## Scope rule

A feature belongs in the default consumer product only when it materially improves what a user can do with a PDF, improves reliability/privacy/usability, or materially improves performance.

Advanced enterprise-security functionality must never increase startup cost or normal-user UI complexity in the browser build.

## Runtime tiers

### Consumer core — eager

The fast path contains only what is needed to launch PDF Studio and reach the normal PDF workspace:

- application shell and home screen;
- file/project opening;
- viewer foundation;
- common editing and page-management foundation;
- local project/storage primitives required by those workflows.

### On-demand PDF tools — lazy

These remain first-class product features but load only after the user chooses them:

- OCR;
- scan/camera workflows;
- compare;
- batch processing;
- repair;
- advanced inspection;
- accessibility and standards tooling;
- advanced conversion and creation tools;
- diagnostics, validation, maintenance, and release information.

The service worker runtime-caches these chunks after first use so they can subsequently work offline without making the first install download every specialist tool.

### Desktop companion — optional

Native-only capabilities remain optional and may not be required for the browser application:

- native certificate stores;
- scanner drivers;
- watched folders;
- PKCS#11/HSM integrations;
- CLI and shell integration.

### Enterprise security archive — not consumer runtime

The C.19-C.45 post-quantum, fleet-governance, device-attestation, federation, zero-trust, enterprise-release and related research packages are retained as optional/archived engineering work. They are not a reason to add routes, startup imports, network services, or mandatory browser dependencies to the consumer application.

They may be reintroduced only behind a separate package/build boundary if a concrete product requirement justifies them.

## P0 performance invariants

- Home must not eagerly import specialist routes.
- Opening one specialist tool must not force unrelated specialist tools into the startup chunk.
- The generated PWA offline manifest must distinguish consumer-core assets from runtime/on-demand assets.
- OCR language data remains explicit opt-in data.
- Enterprise/native features must remain absent from the browser fast path.
- Large-document safeguards remain enabled.

## Development priorities after P0

1. Universal existing-content text editing and reflow.
2. Original-page-preserving OCR with aligned invisible text.
3. Complete page/document operations.
4. Forms, signing, protection, and redaction depth.
5. Conversion fidelity.
6. Compression/repair/optimization.
7. Mobile/tablet first-class UX.
8. Further performance reconstruction and worker isolation.
9. Consumer UX simplification.
10. Competitive feature-gap audit.
11. Consumer release qualification.
