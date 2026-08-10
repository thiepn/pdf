# Phase 14 build audit

The source tree passed the dependency-independent semantic audit, source policy audit, 15-check runtime regression, deterministic PDF corpus generation, and independent PyMuPDF/pypdf validation.

The native editor deliberately limits direct static text replacement to Latin-1. Other scripts are classified and routed to a non-destructive annotation fallback. Vector editing is limited to confidently bounded simple rectangle candidates. Output page count and replacement text are validated after reopening.

The stable gate still requires the official npm lockfile, Vite/Vitest, browser WebAssembly execution, Playwright, and external-reader validation.
