# P1 — Existing-Content Editing Excellence

## Decision

Physical human usability qualification is intentionally deferred until the implementation roadmap is complete. P1 therefore begins the implementation program rather than claiming human-usability evidence.

P1 improves the strongest product differentiator: changing content that already exists inside a PDF while preserving document fidelity and failing safely when the document cannot be reconstructed reliably.

## P1.1 — Safe document-wide find & replace

The first slice adds document-wide find and replace to the unified editor.

### Product behavior

- Search all detected existing-text objects in the current PDF.
- Support case-sensitive and whole-word matching.
- Preview total, replaceable, and blocked matches before committing work.
- Queue all safe replacements as one undoable editor action through the existing native-edit queue.
- Preserve a compatible already-queued fixed-box text edit instead of silently throwing away its settings.
- Never mutate unsupported or appearance-only text automatically.
- Never invalidate an existing layout-aware reflow plan.
- Never queue a replacement that the fixed-box preflight predicts will overflow.
- Never silently switch writing-script/font reconstruction strategy during a bulk replacement.
- Keep blocked matches unchanged and explain why they require manual review.
- Continue using the normal native export, reopen validation, fidelity checks, autosave, undo/redo, and download pipeline.

### Intentional boundaries

- Matching is scoped to individual detected PDF text objects. A phrase split across separate PDF objects is not joined heuristically.
- Bulk replacement uses fixed-box reconstruction only. A match that needs paragraph expansion is deliberately sent back to the existing layout-aware single-object editor.
- Complex-script appearance-only replacements are not bulk-applied.
- The initial slice does not implement regex replacement or automatic redaction; those belong to later P1/P8 work and must reuse the same preflight principles.

## P1.2 — Early Latin encoding preflight

The existing-text panel and export worker now share one Windows-1252 encoding contract for the built-in/simple Latin reconstruction path.

- Unsupported characters are identified while editing instead of after the user starts export.
- The Apply action is disabled when the selected Latin reconstruction path cannot encode the replacement.
- Find & Replace uses the same helper, eliminating a second copy of the encoding table.
- The worker uses the same encoder, so preflight and final output cannot silently drift.
- Qualified Windows-1252 punctuation such as the euro sign, typographic quotes, and em dash remain supported.

This is deliberately an early-failure improvement, not a claim of universal Unicode font reconstruction. Broader script/font coverage remains a later P1 concern and must use a real shaping/font path rather than silently substituting unsupported glyphs.

## P1.3 — Multi-edit style preservation

Mixed-format paragraphs now preserve untouched interior formatting when the user changes more than one separate region in a single edit.

- A bounded token-level LCS finds unchanged anchors across the edited paragraph.
- Unchanged anchored text keeps its exact detected source font, size, weight, style, and color runs.
- Newly inserted/replaced text inherits the nearest source style instead of flattening the whole changed middle.
- Large token matrices fall back to the previous bounded prefix/suffix strategy to avoid quadratic UI work.
- Find & Replace can therefore safely update multiple matches in the same mixed-format text block when its normal fit/script preflight passes.

This fixes a fidelity defect in the existing paragraph editor itself; it is not merely a Find & Replace enhancement.

## P1.4 — Original vs edited verification

The editor already rebuilt queued native edits into a validated PDF.js live preview. P1 now exposes the missing comparison control:

- When the edited preview is ready, users can switch between **Edited preview** and the untouched **Original** PDF.
- Original mode renders the source PDF itself, hides added/editor/native interaction overlays, and makes the document workspace inert.
- A visible “Original PDF · editing paused” marker prevents source/edited confusion.
- Switching back restores the validated edited preview without re-running the operation.
- The same control is reused inside compact/mobile document controls through the shared context bar.

This turns existing backend fidelity validation into a user-verifiable before/after workflow without creating a second editing engine.

## P1.5 — Style-aware fit and reflow planning

Mixed-format paragraph fit preflight now mirrors the worker's styled wrapping structure instead of measuring every character at the largest run size.

- Each preserved formatting run contributes widths using its own font size.
- The paragraph still uses its largest run for line-height safety, matching export behavior.
- Explicit line breaks, whitespace wrapping, and no-wrap overflow use the same structural rules as the worker.
- Layout-aware reflow uses the style-aware required height.
- Find & Replace uses the same style-aware fit preflight before queuing mixed-format replacements.
- Non-preserved single-style editing continues to use the existing simple fit path and automatic font-size fitting.

The browser estimator remains conservative rather than claiming exact embedded-font glyph metrics; final worker and P8 output validation still remain authoritative.

## P1.6 — Preserve backgrounds during text reconstruction

Native text/table-cell replacement no longer reuses the destructive all-content redaction mode.

- Source text is removed with MuPDF's text-only redaction configuration.
- Overlapping image pixels are preserved with `REDACT_IMAGE_NONE`.
- Overlapping vector/line art is preserved with `REDACT_LINE_ART_NONE`.
- Replacement text now defaults to a transparent background rather than painting an opaque white rectangle.
- A solid replacement background remains available as an explicit editor option when the document actually requires one.
- Find & Replace inherits the transparent fidelity-preserving default.
- Legacy queued edits that explicitly stored an opaque background continue to honor that choice.

Image/vector replacement keeps its existing destructive-region semantics; this P1 change is scoped to existing text and table-cell reconstruction.

## P1.7 — Browser-level reconstruction fidelity regression

The showcase document now provides a real-browser regression for the highest-risk P1.6 behavior.

- The test selects existing text drawn over a pale vector card.
- It samples the rendered PDF canvas inside the source text bounds before editing.
- It changes the existing text and waits for the validated native preview.
- It verifies the median background pixel remains the same rather than becoming white or losing the source vector fill.
- It then switches to the untouched Original view and verifies the source background again.
- This exercises the actual browser worker → MuPDF rewrite → PDF.js render path, not just source-code contracts.

The regression is deliberately visual and local to a deterministic generated fixture so it can run in CI without external documents or private content.

## P1.8 — Imported-font preflight

Imported matching fonts are now validated before they can become part of an existing-text edit.

- Font bytes are parsed in a lazy MuPDF worker using the same `mupdf.Font` implementation used by export.
- Empty and oversized imports are rejected before worker work; the import cap is 25 MB.
- The validator checks the current edited text against the font's glyph map and reports missing characters.
- Corrupt/unreadable fonts are rejected immediately with a local editor message.
- Worker startup, message decoding, runtime errors, and cancellation all fail closed.
- The selected font is stored in editor state only after validation succeeds.
- A browser regression uploads deliberately corrupt font bytes and proves the editor rejects them before Apply/export.

## P1.9 — Imported-font validation freshness

An imported font can no longer become stale after it has passed the initial P1.8 import check.

- Successful validation is keyed to the exact current replacement text and selected font name.
- Any later text change immediately makes the previous acceptance non-current, so Apply stays blocked until the font is checked again.
- The same lazy MuPDF validator reruns after text changes and reports newly missing glyphs without discarding the selected font.
- Users can fix the text, choose another font, or return to the built-in reconstruction path.
- The worker now validates glyph advance metrics in addition to glyph presence, catching fonts that parse but expose unusable layout metrics.

This closes an export-time failure window without changing the supported font model.

## P1.10 — Exact source-span redaction geometry

Paragraph replacement no longer removes source text through one broad union rectangle when MuPDF preserved finer source-span geometry.

- Native text edits can carry optional `sourceRects` alongside the legacy `sourceBounds`.
- Reconstructed paragraphs use retained original span rectangles for removal, including mixed-style spans on the same visual line.
- Replacement destination geometry stays independent, so moved/reflowed text still removes glyphs from their original source locations.
- Manual text edits, layout-aware followers, Find & Replace, move/resize, deletion, and the legacy properties path all use the same geometry helper.
- The worker validates persisted rectangles, creates all text-only redaction annotations first, then applies them in one pass.
- Existing stored edits without `sourceRects` continue to fall back to `sourceBounds` or `bounds`; no schema/version bump is required.

This materially reduces collateral removal of nearby or overlapping text that happens to fall inside a paragraph's coarse bounding box.

## P1.11 — Activate the layout-aware text editor in the unified UI

The main unified editor now routes selected native text objects through `LayoutAwareTextPropertiesPanel` instead of the legacy text panel.

This makes the P1 safeguards actually active in the primary editing surface:

- style-aware fit and reflow planning,
- mixed-format run preservation,
- imported-font validation and freshness checks,
- transparent/background-preserving reconstruction,
- exact source-span removal geometry,
- layout-aware follower movement,
- early encoding failures instead of export-time surprises.

The selected text object's actual `NativePageTree` is passed into the panel, so reflow planning uses the correct page flow and blocker geometry. Tables and nested complex objects continue using their specialist panels; older non-text object types retain their existing legacy controls.

## P1.12 — Properties-panel history synchronization

Existing-text controls now follow the editor's real Undo/Redo history instead of keeping stale local state.

- The layout-aware panel rehydrates when its queued primary edit changes, not only when a different PDF object is selected.
- Undo restores the source paragraph text/font/background state in the open properties panel.
- Redo restores the queued replacement state.
- The legacy fallback follows the same rule for consistency.
- The existing browser Undo/Redo regression now asserts textarea state as well as queue state, validated preview state, and final exported text.

This keeps the visible editor controls, native edit queue, live PDF preview, and export history on one authoritative state timeline.

## P1 implementation completion

The implementation audit after P1.12 found no additional reproduced existing-text failure that justified expanding this phase further.

The automated P1 scope is therefore frozen at P1.1–P1.12. Final automated qualification must run against the exact frozen tree. Any later producer/font fixture belongs in a follow-up only when it protects a concrete reproduced defect rather than expanding the product spec speculatively.

### Qualification correction

Final browser qualification exposed one integration defect after P1.11 activated the layout-aware panel: conservative browser fit estimation could report both the source and a harmless replacement outside the detected PDF box, causing valid edits to be blocked even when the replacement was no larger than the text already rendered there. P1 now compares the edited line count, estimated height, and maximum line width against the original source-text footprint. Fixed-box edits and Find & Replace accept replacements that are no worse than that source baseline, while layout-aware follower reflow is reserved for genuine additional vertical growth. Replacements that increase the baseline footprint remain blocked or require explicit safe reflow. Qualification also exposed a pre-existing Find & Replace parser bug where hyphenated queries were escaped incompatibly with Unicode regex mode; hyphenated document text now searches normally. Final browser qualification then exposed a writer/UI mismatch: the browser fit model correctly accepted a source-equivalent two-line replacement, but the MuPDF writer rewrapped it across the union paragraph width into three synthetic lines. The writer now reconstructs fixed-box replacements against the retained original visual-line regions whenever exact source span geometry is available, keeping source-equivalent edits on the original line boxes instead of overflowing the paragraph union. Each retained line keeps its original vertical position while being allowed to use the remaining horizontal width of the paragraph region, so a slightly wider replacement on the same visual line does not force a synthetic extra line.

Physical human/device usability qualification remains intentionally deferred until the broader implementation roadmap is complete. Automated CI policy/contract checks are not human evidence and must not be reported as such.
