# PDF Studio v7.1.4

v7.1.4 is the task-first PDF Studio release candidate promoted through the repository's fail-closed release process. It keeps PDF processing local to the browser and preserves the existing v9 project-package and v13 database formats.

## Highlights

### Existing-content editing

- safer document-wide find/replace and layout-aware text reconstruction;
- source-span/background/style preservation improvements;
- imported-font preflight and stale-validation protection;
- original-vs-edited verification in the primary editor;
- synchronized Undo/Redo state across native selection and properties.

### Smarter document entry

- deterministic local recommendations choose a small set of relevant existing tasks from PDF structure;
- recommendations remain local, bounded and optional;
- signed, repaired, scan-heavy, form-heavy and risky-content documents receive preservation-aware suggestions.

### OCR 2.0

- OCR preserves original page artwork and appends an invisible searchable text layer;
- recognition evidence, corrections and exclusions remain locally reviewable;
- region OCR updates only the selected region;
- searchable OCR output can continue directly into Edit as a derived project.

### Native file workflow

- progressive native Open, Save and Save As where supported;
- explicit, separately confirmed Replace original;
- external-change checks before linked-file writes;
- durable external `.lpsproject` backup folder support;
- download fallback remains universal.

### Output verification

- one shared Output Verification surface across major workflows;
- measured page/file/searchability evidence;
- preservation/change checks for links/forms and related structure;
- sampled evidence is labeled honestly;
- lossy operations explain their consequences.

### Mobile interaction

- live VisualViewport/keyboard-aware mobile sheets;
- touch targets hardened to at least 44 CSS px where required;
- page reordering is fully possible without HTML drag-and-drop;
- selected pages can be moved together or directly to a requested output position.

### Forms and permanent redaction

- reviewed creation of interactive text fields and checkboxes;
- local form-region suggestions;
- literal, bounded-regex, email, phone, IBAN and payment-card redaction discovery;
- IBAN MOD-97 and payment-card Luhn validation reduce false positives;
- discovery never deletes content;
- permanent redaction still uses the existing MuPDF redaction pipeline and blocks output if covered selectable text remains.

### Fidelity and compatibility

- Editor and Secure/P7 outputs now run mandatory fidelity validation before publication;
- untouched sampled pages must preserve text/image/vector/annotation/link/widget evidence;
- intentional form, sanitization and encryption changes require explicit structural expectations;
- page geometry, page labels, outlines, attachments, forms, metadata, JavaScript and encryption remain fail-closed by default;
- compatibility sampling remains deterministic and bounded;
- the P8 corpus is independently opened by PyMuPDF and pypdf.

## Release integrity

The release workflow additionally requires:

- exact committed dependency lock/toolchain qualification;
- historical runtime/migration/privacy gates;
- TypeScript and the full unit suite;
- reproducible production distribution fingerprints;
- moderate-or-higher dependency security audit;
- deterministic application/third-party licence packaging;
- Chromium, Firefox, WebKit, phone Chromium and tablet WebKit qualification against the exact built artifact;
- deployed Stable PWA/version/channel/integrity smoke verification before the GitHub Release is published.

Release archives include source, the browser-qualified distribution, corpus reports, the P9 freeze/qualification documents, release metadata/integrity evidence, licence inventory and SHA-256 checksums.

## Compatibility and limits

- Existing `.lpsproject` v1–v9 imports remain supported; v9 remains the current package format.
- Database schema remains v13.
- Native editor state remains schema v6.
- Editing a PDF changes its bytes; prior digital signatures require re-validation.
- PDF-to-DOCX remains text-focused rather than layout-faithful Office conversion.
- Raster workflows intentionally lose interactive PDF structure and disclose that loss.
- PDF/A output is a candidate/preparation workflow, not independent standards certification.
- Browser mode does not claim certificate-backed signing or universal arbitrary-PDF Word-like editing.
- Automated browser phone/tablet profiles are not physical-device or human usability certification.
