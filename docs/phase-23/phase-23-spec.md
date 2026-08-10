# Phase 23 Specification — Mobile & Tablet Excellence

## Product constraint

Local PDF Studio remains a browser-first, static, local-first PWA. Mobile/tablet work must not introduce a native desktop dependency, server-side document processing, or a second product codebase.

## UX goals

1. Keep the document canvas as the primary surface on small screens.
2. Replace permanent sidebars with reversible sheets instead of deleting capability.
3. Keep common document modes within one thumb reach.
4. Make all destructive/export workflows behave identically to desktop and retain Phase 16–22 transaction/storage safeguards.
5. Respect safe areas, mobile browser chrome, software keyboards, coarse pointers, and touch scrolling.
6. Preserve tablet density: do not force phone layouts onto iPad-sized viewports.

## Acceptance requirements

- Phone workspace provides Read/Edit/Pages/Tools/More navigation.
- Viewer search/pages/outline/info are accessible on phone.
- Editor panels do not cover each other by default on phone.
- Property form controls avoid iOS focus zoom through 16 px mobile input sizing.
- Software keyboard shrinkage updates the effective app viewport.
- Safe-area insets are included in bottom controls.
- Touch targets are at least 44 px where coarse-pointer interaction is primary.
- Organizer remains usable with two page thumbnails per row on common phone widths.
- Desktop layout and the Phase 22 GitHub Pages deployment model remain unchanged.
