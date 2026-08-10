# Phase 3 — Visual Editor

Phase 3 introduces a browser-local, non-destructive object layer over PDF.js-rendered pages. Local editor objects are persisted independently from the source PDF and compiled into PDF annotations and links by a MuPDF worker during export.

## Architectural boundaries

- PDF.js owns page rendering and export reopening validation.
- The React/SVG editor owns transient interaction and local editor objects.
- IndexedDB owns editor state and imported binary image assets.
- MuPDF owns final PDF mutation and save.
- The original PDF remains immutable.

## Export contract

A successful Phase 3 export must:

1. Open the source with MuPDF.
2. Run PDF syntax checking before edits.
3. Compile every visible supported object.
4. Save with garbage collection, stream compression, generated appearances, and retained encryption.
5. Reopen through PDF.js.
6. Match the original page count.
7. Show at least the expected annotation and link count increase on affected pages.
8. Block download when validation fails.

See `acceptance-matrix.md` and `reports-build-0.7.0.md`.
