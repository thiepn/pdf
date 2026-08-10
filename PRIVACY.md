# Privacy Model

PDF Studio is designed as a browser-local application.

## Data kept locally

- Source PDFs
- Project manifests and viewer state
- Editor objects and imported image assets
- Non-secret security preferences
- OCR jobs, recognized text, word geometry, and generated searchable pages
- Batch recipes
- Up to 50 sanitized technical error records when diagnostic logging is enabled
- Up to 300 optional output activity receipts containing filename, MIME type, size, timestamp, release version, route, and SHA-256 checksum

Activity receipt logging can be disabled in Settings and cleared independently. Receipts do not contain PDF bytes, extracted text, OCR text, editor content, form values, or passwords.

Support bundles omit output filenames by default and never include document bytes or passwords.

## Data not persisted

- PDF open passwords
- Owner passwords
- Certificate passwords
- Private keys
- Password-form-field values

## Network access

The static application files are downloaded from the hosting site. OCR language packs are downloaded only after explicit user action from the configured Project Naptha tessdata host. No PDF bytes or OCR text are sent with that request.

## Browser storage limits

Clearing site data deletes local projects. Browser eviction remains possible when persistent storage is not granted. Version 9 `.lpsproject` backups provide independent SHA-256 verification of payload bytes and canonical backup metadata and should be exported for important work.

## Runtime privacy verification

The release-validation workspace reports cross-origin resource requests observed during its generated-fixture test. Core validation should remain same-origin. OCR language packs are the only expected optional external download and require explicit user action.

## Native and compliance state

Queued native edits and compliance settings are stored locally in IndexedDB and can be included in version 9 project backups. Passwords, private keys, certificate secrets, PDF bytes beyond the selected backup, and extracted document text are not added to compliance settings.


## GitHub Pages origin isolation

PDF Studio does not upload document content to an application server, but browser storage is isolated by **origin**, not by URL path. If the app is hosted as a GitHub Pages project site under `username.github.io/repository/`, other applications served from the same `username.github.io` origin are not separated by the repository path at the browser storage-security layer. Phase 22 namespaces its caches and restricts maintenance/service-worker operations to this deployment to avoid accidental interference. For stronger isolation, use a dedicated custom hostname for this Pages site.

## Installed-PWA file and share entry (Phase 24)

When the browser/operating system supports PWA File Handling or Web Share Target, PDF Studio can be offered as an Open/Share destination for `.pdf` and `.lpsproject` files. These entry points do not introduce an upload server. Share Target POST requests are intercepted by this deployment's scoped service worker and stored temporarily in a browser-local Cache Storage inbox until the Home screen imports them. File Handling uses browser-provided local file handles. Unsupported platforms continue to use ordinary file pickers.


## Phase 30 release privacy verification

The final release gate statically audits network sinks and persistence boundaries and also retains the in-app runtime external-resource audit. Stable publication expects no cross-origin core resource loads; the only allowed cross-origin fetch in production source is the explicit user-triggered OCR language-pack download from the configured Project Naptha tessdata host. The final support-bundle path does not load PDF bytes, OCR page content, editor state, or passwords, and filenames remain opt-in.
