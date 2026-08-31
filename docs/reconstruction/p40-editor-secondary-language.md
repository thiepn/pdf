# P40 — Editor Status & Secondary-Surface Language Cleanup

## Goal

Finish the normal editor-language cleanup outside the primary properties and Layers surfaces. Status text, document subtitles, progress messages, fallback notices, tooltips, empty states, local-save labels, and the protected-PDF explanation should describe what the user can do or what is happening without exposing engine, reconstruction, overlay, queue, revision, or validation-pipeline vocabulary.

## Scope

P40 changes presentation copy in `EditorPage` and the shared local-save status labels. It also updates the local-save unit expectations and adds browser/source regression coverage.

Normal surfaces now use these concepts:

- `Opening PDF` rather than opening a PDF engine;
- `finding editable content` rather than loading/inspecting implementation objects;
- `PDF items` and `added objects` rather than unified/native/overlay object language;
- `PDF edits ready` rather than queued existing-content edits;
- `Preparing`, `Checking`, and `Saving` the edited PDF rather than compiling, reopening, validating, or creating a project revision;
- concise user-facing verification failures instead of pipeline counts;
- local-save wording centered on whether changes are saved locally;
- a protected-PDF explanation that says the password stays in the tab and is not saved.

## Product boundary

No PDF inspection, capability scoring, selection, geometry, object ordering, native-edit routing, clipboard behavior, persistence semantics, password handling, export bytes, validation rules, undo/redo behavior, or project lineage behavior changes. Internal identifiers such as `native*`, `overlay*`, `unified*`, the `unified-editor` source key, worker names, and test selectors remain valid engineering vocabulary.

## Qualification

P40 regression coverage verifies the normal editor header/status surfaces after opening and editing the sample, verifies the local-save and export-result language, and statically rejects the retired user-facing phrases in source. Full repository CI, browser regression, Consumer performance budget, and R10 operational readiness remain the merge gate.
