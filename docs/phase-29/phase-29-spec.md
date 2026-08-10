# Phase 29 Specification — Final UX, Accessibility & Performance Polish

## Goal

Freeze functionality and remove the remaining release-polish risk before Phase 30. The web app must remain understandable, keyboard-operable, resilient at 200% zoom and 320 px widths, touch-safe, and bounded on extremely large PDFs.

## Workstreams

1. **Keyboard and focus** — skip link, SPA route focus, modal trapping/restoration, document-tab arrow navigation, visible focus indicators.
2. **Semantics** — labelled dialogs, viewer controls, live status/error announcements, tab/tabpanel relationships, page labels.
3. **Visual accessibility** — normal-text contrast, reduced motion, increased contrast, forced colors, zoom-collapse behavior.
4. **Touch/mobile** — minimum coarse-pointer target sizes, safe compact layouts, mobile Settings access.
5. **Performance** — a stricter extreme-document budget and additional content containment.
6. **Qualification** — Phase 29 runtime/unit/E2E checks integrated into CI, Pages deploy, and tagged releases.

## Non-goals

- No new PDF tools or formats.
- No architecture rewrite.
- No backend or desktop runtime.
- No claim of formal WCAG certification without the real browser/assistive-technology release pass.
