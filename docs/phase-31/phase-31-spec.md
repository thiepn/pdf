# Phase 31 Specification — Interaction Critical-Path Performance

## Goal

Make the editor feel immediate during the first seconds after opening a PDF and during continuous pointer interaction. P31 prioritizes visible-page rendering, scrolling, dragging, resizing, typing, and zooming over non-critical document enrichment.

## Performance invariants

1. **Input wins over enrichment** — optional/native inspection must not begin while the user is actively interacting with the document surface.
2. **One visual update per frame** — continuous move/resize preview work is coalesced through `requestAnimationFrame` instead of reacting to every raw pointer sample.
3. **No parent-state round trip per pointermove** — added-object and existing-PDF move/resize previews stay on the local DOM interaction path; durable editor state/history is committed only when the interaction ends.
4. **Bound background rendering** — editor thumbnail rendering uses a shared low-priority queue instead of launching an unbounded set of nearby page renders.
5. **Correctness is unchanged** — native inspection, snapping, transform validation, history, autosave, export, and existing-content editing remain authoritative after the interaction completes.
6. **Local-first remains intact** — no server dependency, upload path, or remote processing is introduced.

## Workstreams

### 1. Input-aware deferred hydration

Non-critical editor hydration still starts automatically, but only after the initial document surface has painted and the browser has observed a quiet input window. Pointer, wheel, scroll, keyboard, and touch activity postpone enrichment. Cancellation remains wired to editor/document lifecycle changes.

### 2. Added-object move and resize fast path

For overlay objects, pointermove computes the transient geometry locally and applies the visual rectangle directly to the active DOM object at animation-frame cadence. `EditorPage` is not updated on every move sample. The final preview object is committed through normal history/state logic on pointerup.

Ink drawing remains on the existing preview path in P31; this phase specifically removes the highest-cost move/resize parent rerender loop without changing drawing semantics.

### 3. Existing-PDF native transform fast path

Native hitboxes no longer keep drag preview geometry in React state. Pointer samples update only the most recent coordinates; one animation frame performs snapping/clamping and applies the visual result. Parent native-edit state is updated once when the transform is committed.

### 4. Thumbnail contention control

When a consumer does not provide its own render scheduler, thumbnails share a fallback `RenderScheduler` with at most two concurrent low-priority renders. This prevents page-thumbnail bursts from competing with the visible editor canvas and input handling.

### 5. Regression qualification

Add browser qualification for:

- deferred enrichment yielding to continued user activity;
- DOM fast-path use during added-object drag;
- main-thread responsiveness during continuous drag;
- existing historical PDF/editor correctness suites remaining green.

## P31 target budgets

These are interaction targets, not guarantees for pathological PDFs:

- continuous move/resize preview: one scheduled visual update per display frame;
- Chromium interaction long task during the P31 drag fixture: `< 500 ms` maximum, with the target of no perceptible long task;
- background native enrichment: zero start while qualifying input activity continues, then automatic start after the quiet window;
- fallback thumbnail render concurrency: `<= 2`.

## Non-goals

- No information-architecture redesign; that is P32.
- No new PDF feature or editing mode.
- No removal of native inspection or fidelity safeguards.
- No backend/server processing.
- No claim that all drawing/ink paths are fully isolated from React state yet.
