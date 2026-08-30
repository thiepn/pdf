# P39 — Layers Progressive Disclosure

## Goal

Make the Layers panel useful at a glance without exposing implementation-oriented metadata during normal editing. Everyday layer rows should show the object identity and the editing state a user needs; diagnostic details remain available on demand.

## Scope

P39 changes only the Layers list in the unified editor:

- raw existing-content confidence percentages are hidden by default;
- added-object z-index values are hidden by default;
- the `Overlay objects` heading becomes `Added objects`;
- added objects use plain origin/status wording instead of internal type/order metadata in the default row;
- one explicit `Show technical details` control reveals confidence, source type, internal object type, and layer order;
- queued existing-content edit counts remain visible in the normal row because they affect the user's current work.

## Default Layers contract

Existing PDF content shows:

- the object label;
- its user-facing editability label;
- queued edit count when applicable.

Added objects show:

- the object label;
- `Added in PDF Studio`;
- `Hidden` when the object is hidden.

The default Layers view does not show raw confidence percentages, source-type identifiers, internal object-type identifiers, or numeric layer order.

## Technical disclosure

`Show technical details` is off by default and is local UI state only. When enabled:

- existing PDF rows additionally show confidence percentage and source type;
- added-object rows additionally show internal type and numeric layer order.

The control is reversible and exposes its pressed state for assistive technology.

## Product boundary

P39 does not change object discovery, capability scoring, selection, geometry, visibility behavior, painting order, queued edits, native edit routing, persistence, undo/redo, or PDF export.

## Qualification

Browser regression must prove that technical metadata is absent by default, appears after explicit disclosure, disappears again when disclosure is closed, and that the normal user-facing layer information remains available.

Full PDF Studio CI, Consumer performance budget, and R10 operational-readiness remain the merge gate.

## Follow-up

After P39, the next UX pass should target remaining editor status/report terminology and dense secondary surfaces rather than adding new PDF capabilities.