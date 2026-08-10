# ADR-0005 — Worker Ownership

**Status:** Provisional

## Decision

- MuPDF documents live in a dedicated document worker.
- PDF.js rendering/search work is isolated from the main UI when practical.
- OCR receives a separate worker pool in P0-10.
- Large ArrayBuffers are transferred rather than cloned whenever ownership permits.
- Workers must provide request IDs, structured errors, cancellation and restart behavior.
