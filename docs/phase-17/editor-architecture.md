# Phase 17 unified editor architecture

## Editing model

The Edit surface now has two object sources but one interaction/export surface:

1. **Source-content objects** discovered from the current PDF by the MuPDF worker: text lines, image regions, supported simple vector candidates, detected table cells, and AcroForm widgets.
2. **Overlay editor objects** created by Local PDF Studio: text boxes, images, shapes, markup, comments, links, signatures, and redaction marks.

Source-content edits are queued separately from overlay objects because they have different preservation semantics. Export is deterministic:

`source revision → existing-content transaction → overlay compilation → PDF.js reopen validation → derived project/download`

## Capability levels

- `native-safe`: modifies a PDF-native value without reconstructing page appearance (currently supported form values).
- `safe-reconstruction`: replaces a bounded source region with reconstructed static content.
- `appearance-only`: cannot safely reconstruct the original static representation; a clearly disclosed fallback is used.
- `unsupported`: the editor refuses the mutation.

Capability confidence is an implementation confidence signal, not a standards/conformance score.

## Text

Latin text uses built-in PDF fonts for bounded reconstruction. CJK text uses MuPDF CJK CID-font creation with UTF-16 strings; users may optionally provide a compatible TrueType/OpenType font. Complex shaping and bidi text are not claimed as native/static editing in this phase.

## Coordinates

MuPDF structured-text bounds and annotations operate in Fitz/MuPDF page space. Raw PDF content streams use PDF user space. Phase 17 explicitly converts supported detected vector commands through `PDFPage.getTransform()` and its inverse before exposing/editing them. Canvas source hitboxes also subtract the page-space origin returned by `getBounds()`, so cropped/non-zero-origin pages do not assume `(0, 0)`.
