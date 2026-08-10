# Phase 15 — Forms, Signatures, Standards, and Accessibility

Phase 15 adds a dedicated Compliance workspace on top of the preservation and native-editing engines.

## Forms

The field creator queues native PDF widgets with geometry, names, tooltips, flags, options, and defaults. The worker reopens the output and verifies that unflattened fields persisted.

## Signatures

The browser creates and verifies ECDSA P-256/SHA-256 detached evidence for exact PDF bytes. This is a real cryptographic proof file, but not a standard embedded PDF signature. Certificate-backed PAdES signing remains gated behind a compatible signer or desktop bridge.

## Standards

PDF/A-oriented preparation and baseline accessibility tagging are conservative preparation tools. They do not claim conformance without external validation and meaningful content tagging.
