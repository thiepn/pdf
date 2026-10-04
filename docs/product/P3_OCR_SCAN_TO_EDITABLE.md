# P3 — OCR 2.0 / Scan-to-Editable

## Objective

Turn OCR from a destructive conversion tool into a reusable document capability.

P3 keeps the original PDF pages as the visual source, stores recognition evidence locally, lets the user review/correct that evidence, and appends a positioned invisible text layer only when building searchable output. The resulting PDF can continue directly into the unified editor.

## Product contract

### Preserve the source page

OCR no longer asks Tesseract to generate one-page searchable PDFs and no longer assembles those raster pages into a replacement document.

The P3 writer:

- starts from the original project bytes
- retains every original page, including unselected pages
- retains original page graphics/content streams
- adds invisible positioned text with PDF text rendering mode 3
- validates the reopened PDF before exposing it
- requires the output page count to equal the original document page count

Only selected pages are recognized. Selection does **not** remove other pages from the output.

### Persistent recognition evidence

OCR page results remain in the existing local IndexedDB OCR stores. Each word keeps:

- original recognized text
- confidence
- recognition pixel bounds
- optional user-corrected text
- correction provenance
- optional excluded/ignored state

Correcting or excluding a word never destroys the original recognition value.

Completed OCR jobs can be reopened and reviewed without rerunning recognition.

### Review workflow

The OCR workspace renders the actual original PDF page with positioned OCR boxes.

Confidence bands:

- **high**: 82–100
- **review**: 60–81
- **low**: below 60

Low-confidence words receive the strongest visual warning.

The user can:

- click a word
- correct its searchable text
- exclude a false-positive word from the searchable layer
- restore the original OCR result
- see original OCR text after a correction
- review per-page word count, correction count, and low-confidence count

Changes invalidate only the derived searchable output. Recognition evidence stays reusable.

### Region OCR

Dragging on empty page space defines a normalized region.

Re-recognition:

1. renders only that region using the current OCR preprocessing settings
2. runs the same selected local Tesseract languages
3. removes prior OCR words whose centers were in that region
4. maps the replacement recognition back into the original page coordinate system
5. persists the revised page result

The rest of the page's OCR evidence is unchanged.

### Language behavior

P3 keeps explicit multi-language selection.

When the user has installed OCR packs but has not chosen a language yet, the language panel suggests available packs from browser locale preferences. Suggestions never install data automatically and never remove the ability to select several languages.

Current locale suggestions cover English, German, French, Spanish, Italian, Portuguese, Turkish, Korean, Japanese, Simplified Chinese, and Traditional Chinese when the corresponding pack is installed.

### Searchable PDF writer

The local MuPDF OCR-layer writer maps normalized OCR word boxes onto the actual cropped/rotated PDF page bounds.

It appends invisible text instead of repainting the page.

Currently qualified embedded text paths are:

- Latin / WinAnsi-compatible text
- Korean
- Japanese
- CJK Han through the local CJK font path

A word whose script cannot be encoded safely is omitted from the PDF layer and reported as a warning. P3 fails closed rather than substituting corrupt characters.

### Continue in Edit

After searchable output is validated, **Continue in Edit** saves a derived source-preserving project and opens it in the unified editor.

The OCR text layer is now part of the PDF content, so the normal editor/search/native-inspection pipeline can work from the recognized document without another OCR pass.

The original project remains unchanged.

## Privacy and offline boundary

Recognition uses the existing local Tesseract runtime and locally cached/imported language packs.

PDF bytes, rendered page pixels, recognized text, corrections, confidence data, and region crops are not sent to an AI model or cloud recognition API.

Network access is used only when the user explicitly installs an OCR language pack.

## Signatures and protected PDFs

Password-protected PDFs keep their session-only unlock context when a derived searchable project is created.

Adding an OCR text layer changes PDF bytes. Existing digital signatures therefore require re-validation and must not be represented as remaining cryptographically unchanged.

P3 does not modify the original project in place.

## Performance

- Recognition still supports resumable page-level results.
- Region OCR avoids rerunning an entire page for a localized problem.
- Completed OCR results are reusable after reopening the workspace.
- Before starting Tesseract on a selected page, P3 checks its existing PDF text layer. Pages with substantial selectable text are left unchanged so mixed digital/scan documents do not accumulate duplicate hidden OCR text.
- The Tesseract worker is started lazily only when at least one selected page actually needs recognition.
- Searchable output is rebuilt only when recognition settings or reviewed OCR evidence changed.
- Worker startup has a bounded timeout.
- Export can be cancelled through the project-operation coordinator.
- Worker message/error paths fail closed.

## Automated acceptance

P3 coverage verifies:

- OCR coordinate normalization
- confidence classification
- correction / exclusion / restoration provenance
- selected-region replacement behavior
- locale-aware installed-language suggestions
- source-preserving PDF round trip
- original content remains after OCR layer creation
- all original pages remain when only a subset was recognized
- Tesseract PDF output is not requested
- page merging is not used
- OCR review/correction/region controls are wired
- Continue in Edit uses the normal unified editor route
- recognition remains local

Physical human/device usability qualification remains part of the later roadmap-wide manual qualification phase and is not synthesized by automation.
