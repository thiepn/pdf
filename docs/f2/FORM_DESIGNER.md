# F2 — Interactive form designer

## Scope delivered

The existing PDF Studio editor now includes a **Form field** drawing tool. Drag on a page (or tap to insert a field), then edit the new field's properties in the existing right-hand panel. The task catalogue includes **Create fillable form**, which opens that editor. All changes use the editor's existing undo/redo, local save, resize, duplicate, layer, and download actions.

New AcroForm fields are **real PDF Widget annotations** with field dictionaries, names, tooltips, widget appearances, values, choice options, and required/read-only flags. They remain fillable in compatible PDF viewers. This is not a page-image overlay, flattening, or PDF JavaScript implementation.

Supported: text, multiline text, checkbox, dropdown (single selection), and single-selection listbox. The blue field preview is editor-only. New fields are placed in PDF user coordinates, respecting source page positioning.

## Implementation

- `src/forms/formModel.ts`: typed schema, immutable defaults, field-name generation, bounds, option and default-value validation; reject duplicate names and overlarge requests.
- `src/forms/FormFieldProperties.tsx`: accessible controls for kind, label, description, flags, defaults, choice options, length, and font size.
- `src/forms/formWriter.ts`: AcroForm + /Fields tree, per-page /Annots Widget, /FT, /Ff, /T, /TU, /Rect, /P, /AP, /AS, /V, /Opt and default font resources. Generates separate /Off and /Yes appearance streams for checkboxes.
- `src/workers/editor-export.worker.ts`: after compiling existing added objects, writes all new widgets; uses the existing full-rewrite save, never F1 incremental mode.
- `src/fidelity/`: strict source/output form field and page widget count accounting; unrelated changes still fail export.
- `tests/unit/formDesigner.test.ts`: real MuPDF output and reopen verification, type/option/name validation and editor duplication.

## Safety boundaries and disclosure

- Field names are intentionally simple ASCII identifiers without dot-separated hierarchy; tooltips support text labels.
- Default visual appearances for fields currently support printable Latin ASCII (limited built-in Helvetica, no complex shaping). Unicode field values still need a font-aware follow-up.
- Existing fields are preserved; F2 creates additional fields and rejects duplicate names.
- Radio groups, form JavaScript, XFA, digital signature widgets, multiselect choices, formatted validation/calculation and authoring pre-existing field properties are not yet supported.
- Encrypted documents are not supported for F2 authoring. Do not claim certificate signing.
- All output requires full-rewrite save, PDF.js fidelity certification and a reopened PDF. F1 incremental saving remains disabled.
- Signed/certified PDFs must be rejected by the export gate. Future security updates must preserve these restrictions.
- A field that's hidden in the editor is not exported. Hidden source fields remain untouched.

## Qualification checklist

- [ ] All unit tests, including real MuPDF widget round-trip, pass.
- [ ] Full TS typecheck and production build pass.
- [ ] Browser Playwright task-first editor interaction succeeds.
- [ ] PDF.js recognizes exported field objects and options.
- [ ] External reader (Adobe Acrobat, Chrome, Firefox, PDF24, Preview) verifies field fillability.
- [ ] Existing AcroForm widgets, attachments, bookmarks, encryption and unchanged pages preserve their verified features.
- [ ] Test with malformed/encrypted/signed PDFs and confirm failure-safe refusal.
- [ ] Validate form field names, options and required flags through qpdf/pypdf independently.

## F3 handoff

F3 adds professional comments, review statuses and calibrated measurement tools. F2 can be merged independently; it adds no new PDF dependency or UI shell. Improvements needed before broad claims of Acrobat form-authoring parity: radio group authoring, Unicode defaults and multilingual appearance fonts, form appearance design choices, and form exchange (FDF/XFDF) with import/export.
