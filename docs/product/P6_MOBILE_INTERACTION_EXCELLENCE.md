# P6 — Mobile Interaction Excellence

## Objective

Make PDF Studio's core workflows genuinely touch-first on phones and small tablets. P6 improves interaction mechanics, viewport correctness, and recoverability without creating a second mobile product or changing PDF, project, or package semantics.

## Product contract

1. Mobile must never require desktop HTML drag-and-drop to complete a task.
2. Every primary touch action has a minimum 44 CSS px target.
3. Bottom sheets and dialogs are positioned inside the live VisualViewport, including when the software keyboard shifts that viewport.
4. Keyboard appearance must yield space to the focused control instead of hiding it under fixed chrome.
5. Mobile interactions use the same underlying operations and validation as desktop.
6. Rotation and short-height landscape must keep document controls reachable.
7. Touch fallbacks must be explicit and understandable; gestures may accelerate an action but cannot be the only way to perform it.
8. Browser/PDF pinch zoom and document zoom remain separate concepts.
9. P6 does not change IndexedDB, project-package, writer, OCR, security, or native-file schemas.

## P6 implementation

### Live viewport geometry

`MobileViewportManager` publishes:

- live visual viewport width and height;
- visual viewport top and left offsets;
- keyboard inset;
- keyboard-open state;
- responsive class and orientation.

VisualViewport resize/scroll work is animation-frame coalesced so keyboard animation does not trigger redundant layout writes.

Phone modal/sheet backdrops use the live viewport rectangle rather than assuming the layout viewport begins at (0, 0).

### Touch page organization

Pages/Organizer retains desktop drag-and-drop as an accelerator but no longer depends on it.

Every page card exposes touch-safe:

- Move earlier
- Move later

When multiple pages are selected, those controls move the selected set together while preserving relative order.

The selected-pages action bar also supports **Move to position**, allowing a selected block to be placed directly without repeated taps.

### Keyboard and sheet behavior

- modal/sheet surfaces clamp to the current visual viewport;
- scrollable dialogs reserve safe-area/keyboard space;
- focused form controls remain at 16px or larger on phone to avoid browser auto-zoom;
- bottom chrome remains suppressed while the software keyboard is open.

## Acceptance

P6 is complete when:

1. page reordering is fully usable without drag-and-drop;
2. selected page groups preserve relative order when moved;
3. direct move-to-position is deterministic and range checked;
4. compact dialogs remain inside shifted VisualViewport geometry;
5. keyboard-open layouts do not cover active mobile controls;
6. 320 / 390 / 430 px portrait and short-height landscape remain horizontally contained;
7. existing compact reader/editor controls remain at least 44px;
8. mobile behavior reuses canonical desktop operations;
9. frozen DB/package formats remain unchanged;
10. unit/source regression, typecheck, production build, performance budget, Phase 11/P9 release gates, and browser regression remain qualified.

Physical/human device testing remains deferred to the later qualification phase.
