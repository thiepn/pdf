# ADR-0001 — PDF Engine Split

**Status:** Provisional

## Decision

- PDF.js owns viewing, interactive page rendering, text extraction and search-oriented data.
- MuPDF owns mutable PDF operations, security-sensitive changes and serialization.
- The application owns stable IDs, command history, overlays and non-destructive project state.

## Required validation

This split becomes final only after P0-04 coordinates and P0-05 export/reopen validation pass.
