# P39 — Layers Progressive Disclosure

## Goal

Make the Layers panel useful for choosing content without exposing diagnostic scoring or rendering-order implementation details in the normal workflow.

## Default presentation

- Existing PDF items remain grouped under **Existing PDF content**.
- Items created in the editor are grouped under **Added in PDF Studio**.
- Raw confidence percentages are not shown in layer rows.
- Internal z-index values are not shown in layer rows.
- Pending edits are described as pending changes in ordinary language.
- Detailed support/reconstruction information remains available in the selected item's properties when it is relevant to an editing decision.

## Product rationale

Confidence scores and z-index values are implementation information, not user tasks. Showing them beside every item makes the editor look uncertain and technical even when no action is required. The Layers panel should answer two questions first: **what is this?** and **which item am I selecting?**

## Product boundary

P39 does not change object detection, confidence calculations, paint order, selection behavior, native edit routing, undo/redo, persistence, or export output. It changes only the default presentation of layer metadata.

## Qualification

Browser coverage opens the reconstructed editor, adds an object, opens Layers, and verifies that both source and added items remain discoverable without raw percentage or z-index jargon.
