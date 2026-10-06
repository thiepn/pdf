# P17 — Deep Native-Content Fidelity

P17 implements v7.2 roadmap item **V72-05** while the executable remains v7.1.4.

## Objective

Expand existing-content editing only where PDF Studio can state a deterministic preservation rule. P17 does **not** turn the editor into an arbitrary PDF content-stream rewriter.

The governing rule is:

> promote a class only when source identity, required graphics state, reconstruction geometry, and post-export verification are explicit; otherwise keep it selectable and fail closed.

## Image fidelity

Image inspection now has a specialist graphics-state pass rather than treating every StructuredText image rectangle as equally editable.

The inspector traces page painting operations and records clipping, mask, transparency-group/blend evidence, repeated source usage, and source-image mask metadata.

### Qualified classes

**Plain image instances** support source transform, replacement, and deletion.

**Shared image instances** use instance-local reconstruction. Editing one placement does not rewrite the shared source image resource, so another placement is not implicitly changed.

**Images with an attached soft mask** support source transform and deletion. Source transform reuses the original MuPDF Image, including its attached mask, and the saved PDF is reopened to confirm the destination image is still classified as masked. Arbitrary bitmap replacement is disabled because P17 cannot safely transfer the source mask semantics to unrelated replacement pixels.

### Protected classes

Direct mutation remains blocked when the selected image has:

- an explicit image mask;
- inherited clipping;
- non-Normal blending/compositing state;
- ambiguous graphics-state inspection.

Protected images remain visible and selectable so the limitation is explicit rather than silently flattening them.

After any qualified edit, P17 also verifies that unrelated image instances on the page did not disappear or move.

## Vector fidelity

P17 separates **geometry edits** from **appearance overrides**.

Geometry-only editing keeps the exact inherited source graphics state around the path. This is the safe path when a vector is inside clipping, uses non-Normal blending, or uses a complex color state.

Appearance override is now fail-closed when the source depends on:

- inherited clipping;
- non-Normal blending;
- Lab, Indexed, Separation/DeviceN, Pattern, or unknown color state.

Pattern-capable color operators and shading paints are detected and warned about, but P17 does not pretend that gradients, shadings, or arbitrary pattern resources are ordinary RGB fills.

A path that itself defines a clipping boundary remains fully protected.

## Irregular and merged tables

The table engine already reconstructed rectangular row/column spans. P17 makes that fidelity class explicit.

Detected tables are classified as:

- regular;
- nonuniform;
- merged;
- irregular;
- merged-irregular.

A table is reconstructable only when its cells form complete rectangular coverage of the declared grid. Overlapping merges, out-of-grid spans, uncovered cells, embedded images, or non-grid artwork fail closed.

Row heights, column widths, rectangular spans, and unaffected page content remain explicit reconstruction inputs instead of being normalized into a fake uniform table model.

## Adjacent-region paragraph flow

P17 extends conservative same-region paragraph movement to one bounded cross-region case: a **uniquely detected two-region text thread**.

Two regions are linked only when they have compatible widths, strong vertical overlap, a bounded horizontal gap, and no competing adjacency. If a growing paragraph pushes a suffix beyond the first region, that suffix may continue at the top of the adjacent region and its existing paragraphs are shifted deterministically.

The operation is refused if:

- the destination is too narrow;
- the destination would overflow the page;
- an unrelated fixed object blocks a destination;
- the region relationship is ambiguous;
- the text is RTL/vertical/otherwise outside the existing safe-flow class.

There is still no arbitrary newspaper-layout, multi-region chain, or cross-page Word-style reflow claim.

## Source/output verification

P17 does not introduce a second competing validator. Native export still ends in the existing **P8 fidelity gate**:

`validatePdfFidelity(source, output, intentionallyChangedPages, ...)`

A failed fidelity result blocks publication.

P17 additionally performs class-specific checks inside specialist workers, including image-instance survival and soft-mask survival after reopening.

## Deterministic fixture

`src/fixtures/p17NativeFidelityPdf.ts` generates a reviewable PDF containing:

- a shared RGB image with an attached `/SMask`;
- a clipped image instance;
- a non-Normal-blend image instance;
- a nonuniform table with a rectangular merged cell;
- two separated text regions for bounded flow qualification.

The browser suite generates these bytes at test time. No opaque binary fixture is fabricated or committed.

Historical Phase 28 image/transparency/vector corpora remain regression inputs; P18 expands compatibility and real-device evidence.

## Release boundary

P17 changes no persistent application format:

- executable version: **7.1.4**
- v7.2 target: **7.2.0**
- `.lpsproject`: v9
- IndexedDB: v13
- native editor: v6
- network dependency: none

## What's next

**P18 — Compatibility and Human/Device Qualification (V72-06)**

P18 takes the now-bounded v7.2 feature set into difficult real PDFs, external readers, physical devices, and human acceptance without weakening P17's fail-closed fidelity contracts.
