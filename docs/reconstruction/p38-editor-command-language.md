# P38 — Editor Command User Language

## Goal

Finish removing reconstruction-phase vocabulary from normal editor command feedback. Users should see the practical editing boundary, not internal phase names or source-object implementation terminology.

## Scope

P38 changes four user-facing strings in `EditorPage`:

- the mixed-selection count badge;
- duplicate-selection guidance when existing PDF content is selected;
- copy guidance when existing PDF content is selected;
- painting-order guidance for existing PDF content.

Internal engineering identifiers such as the `.p6-selection-count` CSS class and P6 regression filenames remain valid and are not user-facing.

## User-facing contract

- A mixed selection is described simply as `<n> selected`.
- Existing PDF objects that cannot be duplicated are explained as a safety limitation, without phase vocabulary.
- Existing PDF objects that cannot be copied independently are explained directly.
- Bring-to-front/send-to-back guidance states that only objects added in PDF Studio can be reordered while existing PDF painting order is preserved.
- Normal command warnings must not expose `P1` through `P8` phase labels.

## Product boundary

No selection geometry, writer routing, native capability, clipboard payload, ordering behavior, undo/redo, persistence, or export behavior changes.

## Qualification

P38 browser coverage creates a mixed selection, verifies the compact selection badge, then exercises duplicate and copy command feedback. Full repository CI, browser regression, consumer performance, and R10 operational-readiness remain the merge gate.

## Follow-up

The Layers list still exposes source-object confidence percentages and z-index-like implementation detail. That is intentionally deferred to P39 progressive disclosure rather than expanding this command-copy change.
