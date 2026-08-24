# R6 — Mobile & Responsive Reconstruction

## Purpose

R6 makes the reconstructed PDF Studio usable as a touch-first document application on phones and tablets without creating a second product or weakening the desktop workflows established in R5.

R6 is a responsive interaction/presentation phase. It does **not** change PDF processing, writer semantics, OCR/security engines, persistence schemas, task capability rules, or output validation.

## Product rules

1. **One persistent document navigation layer on phones.** Read, Edit, Pages, Tools, and More remain reachable from one bottom workspace bar.
2. **Canvas first.** Mode-specific controls may float or open as sheets, but they must not permanently consume large vertical areas above and below the PDF.
3. **No hidden capability forks.** Mobile actions route to the same R3/R4 canonical workflows as desktop.
4. **Touch targets are at least 44 CSS px** for normal interactive controls on coarse-pointer/mobile surfaces.
5. **No page-level horizontal overflow** at supported phone widths and phone landscape.
6. **Live visual viewport is authoritative** while the software keyboard is open. Bottom navigation and floating edit controls yield space to the focused field.
7. **Sheets are bounded and recoverable.** Tool, property, viewer sidebar, history, preservation, and More sheets must fit inside the live visual viewport and expose an obvious close/backdrop route.
8. **Tablet is not stretched phone UI.** Tablets preserve a wide PDF canvas while side panels become overlays/drawers instead of squeezing the document.
9. **Browser zoom remains distinct from PDF zoom.** The PDF stage permits normal pan/pinch behavior while explicit PDF zoom controls remain available.
10. **Safe areas are structural.** Bottom navigation and sheets account for device insets.

## Responsive tiers

### Phone

Primary qualification widths: 320, 390, and 430 CSS px in portrait, plus a short-height landscape case.

- Workspace tabs are compact document switching controls.
- Persistent document navigation is Read / Edit / Pages / Tools / More.
- Read keeps the PDF canvas dominant; pages/search/metadata open as a sheet.
- Edit keeps the PDF canvas dominant; quick tools float above the canvas rather than reserving a second permanent bottom row.
- The full editor tool catalog, zoom, Snap, Download PDF, and Save as project remain available through the editor tools sheet.
- Pages keeps a two-column thumbnail grid and horizontally scrollable action controls where necessary.
- History, preservation, properties, layers/pages/comments, and More are bottom sheets.

### Tablet

Primary qualification size: 834 × 1112 CSS px plus landscape compatibility through the existing WebKit tablet project.

- The PDF canvas remains the main region.
- Editor tool rail remains available.
- Pages/layers and properties panels overlay the stage instead of reducing its layout width.
- Viewer sidebar remains available without turning the tablet into the phone bottom-sheet layout.
- Page organizer uses a three-column thumbnail grid where space allows.

## Keyboard behavior

`MobileViewportManager` publishes the live visual viewport height/width, top offset, keyboard inset, responsive class, and orientation on the root element.

When the software keyboard is considered open:

- workspace mobile navigation hides;
- floating editor quick tools hide;
- editor content receives the vertical space;
- open sheets/panels clamp to the live visual viewport;
- form controls use 16px text on phone to avoid browser auto-zoom.

## R6 automated acceptance

The mobile Playwright contract must prove:

- the existing touch-first Read/Edit/Pages/Tools/More flow remains usable;
- all phone workspace-navigation controls meet the 44px target;
- 320 / 390 / 430px layouts produce no page-level horizontal overflow;
- editor quick tools are floating rather than a reserved second bottom row;
- tool sheets fit within the live viewport;
- simulated keyboard-open state removes competing bottom chrome;
- phone landscape remains horizontally contained and retains document navigation;
- tablet editor panels are overlays and do not shrink the canvas;
- existing mobile/tablet browser-compatibility, privacy, PWA, R4 capability, and R5 desktop suites remain green.

## Release gate

R6 may merge only when the exact branch head passes:

- consumer performance budget;
- Phase 11 stability gate;
- P8 corpus and P9 freeze audit;
- v7 non-browser release qualification;
- reproducible build;
- dependency security/source audit;
- verified-distribution browser/privacy matrix including the R6 phone and tablet tests.

A retry-only unrelated historical browser flake may be recorded, but an R6-specific failure blocks merge.
