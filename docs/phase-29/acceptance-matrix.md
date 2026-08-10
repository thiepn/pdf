# Phase 29 Acceptance Matrix

| Area | Requirement | Status |
|---|---|---|
| Keyboard | Skip link reaches main workspace | implemented |
| SPA navigation | Route changes announce and move focus | implemented |
| Modal dialogs | Tab trapping, Escape close, focus restoration | implemented |
| Document tabs | Left/right/Home/End keyboard navigation | implemented |
| Viewer | Toolbar/sidebar/page/error semantics | implemented |
| Focus visibility | No custom control suppresses global focus ring | implemented |
| Light contrast | Accent and muted normal text ≥ 4.5:1 on primary light surface | implemented |
| Reduced motion | OS/system preference honored | implemented |
| High contrast | `prefers-contrast` and forced-colors fallbacks | implemented |
| Touch | Coarse-pointer controls ≥ 44 px where practical | implemented |
| 200% zoom | Dense multi-column layouts collapse at narrow CSS widths | implemented |
| 320 px | Global/mobile navigation remains usable | implemented |
| Very large PDFs | 1,000+ pages / 500 MB enters strict render budget | implemented |
| Historical regressions | Phase 11 + 16–29 + Phase 28 corpus remain green | required |
| Stable promotion | exact lockfile + official browser matrix | pending GitHub qualification |
