# P36 — Native Editor User Language

## Goal

Remove reconstruction-phase terminology from the native editing properties UI so people see document concepts and consequences rather than internal implementation milestones.

## Scope

P36 changes user-facing copy only. It does not alter native object detection, editability policy, PDF mutation logic, persistence formats, export fidelity validation, or the P1–P8 engineering/test identifiers.

### Text

- `Existing PDF content · P2` becomes `Existing PDF content`.
- Fixed-region and appearance-only explanations refer to PDF Studio behavior rather than the P2 implementation phase.
- Internal IDs/classes such as `p2-reflow` remain unchanged because they are not product copy.

### Images and vectors

- `Existing image · P3` becomes `Existing image`.
- `Existing vector · P4` becomes `Existing vector`.
- P3/P4 remain valid engineering and regression-test names only.

### Tables

- `Existing table · P5` becomes `Existing table`.
- The primary table facts no longer expose a raw confidence percentage.
- Export behavior is explained directly in user language instead of saying what “P5” will do.

### Nested PDF groups

- `Existing PDF content · P7` becomes `Existing PDF content`.
- P7 remains an internal qualification identifier only.

## Product rule

Engineering phase names may appear in source comments, internal IDs/classes, test titles, release evidence, and reconstruction documentation. They must not be required vocabulary for normal editing decisions.

## Non-goals

P36 does not yet rewrite the separate multi-selection P6 warnings in `EditorPage`; those belong to the next editor-command copy pass because they describe cross-object behavior rather than one native properties panel.
