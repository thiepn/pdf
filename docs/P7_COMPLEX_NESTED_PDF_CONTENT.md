# P7 — Complex / Nested PDF Content

P7 adds safe first-class editing for page-level PDF **Form XObject instances**: reusable nested PDF blocks that may contain text, images, vector artwork, or further nested forms.

## Product behavior

- Detect top-level Form XObject invocations in page content streams.
- Present each invocation as a **Nested PDF group** in the existing-content editor.
- Move, resize, rotate, align, distribute, and delete the selected instance through the P6 unified-layout engine.
- Keep the shared Form XObject stream intact so another use of the same resource is not modified accidentally.
- Preserve the nested block's internal PDF operators instead of flattening it to pixels or rebuilding its child content.
- Surface clipping as an explicit capability warning rather than silently changing the clipping path.
- Fail closed for non-invertible placement matrices and page streams containing inline binary images.

## Safety boundary

P7 edits the page-level `/Name Do` invocation, not the referenced Form stream. A transform wraps only the selected invocation in an isolated graphics state and inserts a derived local `cm` matrix. Deletion removes only that invocation. The reusable Form object remains in the document.

This prevents changing one logo, imported-page block, template component, or diagram from unintentionally changing every instance sharing the same Form XObject.

## Architecture

- `src/workers/native-complex.worker.ts`: Form inspection, instance matching, transform/delete writer, post-save validation.
- `src/native/nativeClient.ts`: memory-bounded inspection integration and P7 export after P1–P5 writers.
- `src/editor/unifiedLayout.ts`: P7 move/resize/delete/rotation integrated with P6 mixed selections.
- `src/editor/native/NativeComplexPropertiesPanel.tsx`: capability and geometry UI.
- `src/fixtures/minimalPdf.ts`: two placements of one shared mixed-content Form XObject.
- `tests/e2e/p7-complex-nested.spec.ts`: transform and single-instance deletion regressions.

## Qualification criteria

P7 is qualified only when typecheck/build, P1–P6 regression, P7 cross-browser regression, export validation, and consumer performance checks are green. Deleting one sample instance must leave the other instance available and the shared Form source unmodified.

## Deliberate non-goal

P7 does not recursively rewrite every operator inside a Form XObject. Deep recursive source rewriting would require stronger resource-inheritance, clipping, transparency-group, marked-content, and shared-resource guarantees than this phase's safe boundary.
