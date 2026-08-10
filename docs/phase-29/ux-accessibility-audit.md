# Phase 29 UX & Accessibility Audit

## Material findings fixed

1. **Light-theme accent contrast** — the previous accent (`#d44c3f`) measured about 3.93:1 against the primary light surface and was used for small text. It is now `#b83d34` (~5.13:1). The warning token was similarly darkened.
2. **Suppressed creator focus ring** — Create PDF Studio used a higher-specificity `outline: 0` rule on its textarea, defeating the global keyboard focus treatment. The suppression is removed.
3. **Modal keyboard escape/focus** — command and password dialogs now keep focus inside, close with Escape, and restore the invoking control when the surface remains mounted.
4. **SPA orientation** — hash-route changes now provide polite route announcements and move focus into the new content surface instead of leaving keyboard/screen-reader position on stale navigation.
5. **Workspace document tabs** — open PDF tabs now use roving tabindex and Left/Right/Home/End keys.
6. **Viewer control names** — icon-only previous/next/zoom/sidebar controls and PDF page shells now expose explicit accessible names.
7. **Mobile global navigation** — Settings replaces Activity in the five-item mobile rail; Activity remains available through the desktop/utility surfaces.

## Remaining release qualification

Static semantics and dependency-independent tests are not a substitute for the real Phase 30 assistive-technology/device pass. Final release should still verify keyboard-only operation, screen-reader announcements, 200% zoom, phone/tablet browsers, and forced-colors/high-contrast environments on the actual deployed artifact.
