# Phase 15 build audit

The 141-file source tree passed the dependency-independent semantic audit, source policy audit, 15-check runtime regression, deterministic corpus generation, and independent PyMuPDF/pypdf validation.

Compliance output is validated by reopening the PDF, checking page count, confirming created fields, and verifying requested language/tag metadata. The interface explicitly separates structural signature-field detection, locally verified detached evidence, and standard certificate-backed PDF signing.

The stable release gate remains blocked by the missing official npm lockfile and unavailable local Vite/Vitest/Playwright/MuPDF browser environment.
