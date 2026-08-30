# P37 — Unified Selection User Language

## Goal

Make mixed-object layout editing understandable without requiring knowledge of PDF Studio's reconstruction phases.

## Scope

P37 updates the unified multi-selection properties panel only. The P6 engineering test name and internal CSS class remain valid internal identifiers.

## User-facing changes

- `P6 · Unified layout` becomes `Unified layout`.
- The mixed-selection explanation describes safe per-object editing behavior instead of qualified P1–P5 writers.
- Vector rotation guidance describes supported source behavior instead of a P4 model.
- Duplication/painting-order guidance explains the actual restriction directly instead of referring to P1–P7 phase identities.

## Product boundary

No selection geometry, writer routing, object capability, undo/redo, persistence, or export behavior changes.

## Remaining follow-up

`EditorPage` still contains three command-level warnings and one compact selection badge with P6/P1–P5 vocabulary. Those are separate command-surface strings and require a focused EditorPage change rather than being hidden or rewritten through CSS.
