# Changelog

## 6.1.0 — Intuitiveness & Discoverability

- Standardized major workflow names across the workspace, Tools, Viewer, command palette, and Help.
- Removed duplicated cross-tool navigation from the Viewer so it contains only viewing/download/backup actions.
- Made Simple mode genuinely progressive: technical preservation and engineering/support destinations are closed or collapsed by default.
- Grouped the editor toolbar into Navigate, Insert, Shapes, Markup, Review, and Redaction.
- Renamed staged redaction to **Mark redaction** and added a persistent warning that content is not permanently removed until redactions are applied.
- Replaced existing-content implementation jargon with plain editability labels; confidence and technical details remain available on demand.
- Replaced OCR render-scale defaults with Fast / Balanced / Best recognition presets and moved raw cleanup controls under Advanced image cleanup.
- Added clickable page-range examples for common selections.
- Simplified professional/standards terminology and paired specialist terms with plain-language labels.
- Expanded bundled offline Help to cover everyday, professional, recovery, PWA, and advanced workflows.
- Simplified download-history, local-storage, PWA persistence, and support wording.
- No PDF feature, project schema, database schema, settings schema, batch schema, or `.lpsproject` format changes.

## 6.0.6 — Bug Fix Audit 4

- Added fail-closed future-schema protection for persisted settings, Batch recipes, and local OCR jobs so an older build cannot silently rewrite newer local state.
- Made successful Share Inbox imports durable even when physical Cache Storage cleanup fails by recording a local consumed acknowledgement and retrying cleanup later.
- Reworked project deletion so the authoritative PDF source is removed before the project manifest; if source deletion fails, the manifest is retained so deletion can be retried instead of leaving unreachable private bytes.
- Fixed a service-worker activation race by capturing the waiting worker before sending `SKIP_WAITING`, so activation is not falsely reported as failed when `registration.waiting` changes during the transition.
- Added dedicated v6.0.6 runtime/unit/source-audit coverage and preserved the full v6.0.1–v6.0.6 maintenance chain in candidate and Stable qualification. No PDF features or persistent format versions changed.

## 6.0.5 — Bug Fix Audit 3

- Made installed-PWA File Handling ingress durable: launched files are staged into the local Share Inbox atomically and are acknowledged only after successful project import, so reloads/password prompts/import failures do not silently lose inbound files.
- Made multi-file launch staging atomic with rollback if any Cache Storage write fails; a failed launch cannot leave a half-received batch behind.
- Reworked Maintenance cache cleanup into a non-destructive offline-shell refresh that preserves pending Share Inbox bytes and keeps the previous working shell when a refresh cannot complete.
- Added a dedicated 120-second timeout for complete offline-shell repair while retaining short RPC timeouts for ordinary service-worker status calls.
- Added fail-closed future project-manifest validation to `.lpsproject` restore before project reconstruction.
- Added fail-closed future workspace-session schema protection so an older build cannot silently rewrite newer workspace state.
- Restored the v6.0.1 maintenance regression to ordinary GitHub Pages candidate deployment and added dedicated v6.0.5 runtime/unit/source-audit coverage. No PDF features, package format, project schema, database schema, settings schema, or Batch schema changed.

## 6.0.4 — Bug Fix Audit 2

- Prevented successful PWA shared-file imports from being reported as failures when best-effort inbox cleanup fails after the project has already been committed.
- Prevented checksum deduplication from touching or reusing future/invalid project-manifest schemas before compatibility validation.
- Added fail-closed future-schema guards for persisted editor, security, native-editor, and compliance state; newer state is left untouched instead of being down-converted by an older build.
- Added the same embedded-state schema guard to `.lpsproject` restore, including OCR jobs, and reject duplicate editor object IDs before reconstruction.
- Fixed Stable-tag ancestry qualification to use a full Git history checkout so a legitimate ancestor tag is not falsely rejected by shallow-clone boundaries.
- Added dedicated v6.0.4 runtime/unit/source-audit coverage. No PDF features, package format, project schema, database schema, or settings schema changed.

## 6.0.3 — PWA Ingress & Recovery Consistency Patch

- Fixed PWA Share Target durability so staged files are removed only after project import succeeds; failed/password-gated imports remain locally recoverable instead of being discarded early.
- Made multi-file Share Target staging atomic: partial cache writes are rolled back if a later file cannot be stored.
- Completed Safe Mode service-worker isolation by suppressing `controllerchange` reload handling as well as registration and release-health acknowledgement.
- Added semantic `.lpsproject` consistency validation for duplicate editor assets, missing image assets, duplicate OCR jobs/pages, and OCR pages referencing absent jobs before any project is reconstructed.
- Replaced race-prone Stable-tag equality with a main-history ancestry proof, so a legitimate release does not fail merely because `main` advances while the workflow is running.
- Added dedicated v6.0.3 runtime/unit regression coverage. No PDF features, package format, project schema, database schema, or settings schema changed.

## 6.0.2 — Stable Promotion & PWA Atomicity Patch

- Prevented a release-candidate build from superseding or deleting a same-version Stable PWA cache, even when the candidate has a newer build timestamp.
- Blocked ordinary `main` GitHub Pages deployment when the same semantic-version Stable tag already exists; a new maintenance version is required before another candidate can replace the live site.
- Made production service-worker installation fail closed when `offline-assets.json` is unavailable/empty, deleting the partial new cache and leaving the previous worker eligible to continue serving the app.
- Moved the healthy-release acknowledgement behind a committed React render and a complete offline-cache check before older release caches may be pruned.
- Preserved the Safe Mode boundary by suppressing service-worker health acknowledgement as well as registration while Safe Mode is active.
- Hardened `.lpsproject` decoding so required asset ranges, package collection arrays, and required manifest strings are validated before reconstructed state is accepted.
- Required the Stable release tag to point at the current `main` HEAD before publication.
- Removed stale v6.0.1 hard-coding from the active Release page and made the frozen Phase 30 unit assertion accept later 6.0.x maintenance versions.
- Added dedicated v6.0.2 runtime/unit regression coverage. No PDF features, project-package versions, project schemas, database schemas, or settings schemas changed.

## 6.0.1 — Maintenance Reliability Patch

- Fixed same-version PWA promotion so release-candidate and Stable builds receive distinct service-worker/cache identities; a qualified Stable promotion can no longer leave installed clients pinned to the candidate shell.
- Stamped service-worker version, channel, and deterministic build epoch during production builds and validated that identity in the distribution audit.
- Hardened `.lpsproject` decoding against coercive, negative, truncated, incomplete, and overlapping payload ranges before editor/OCR assets are reconstructed.
- Prevented an older build from rewriting a future local project-manifest schema down to the current schema; unsupported future projects remain untouched and require an app update.
- Fixed CI qualification ordering so the non-browser validation job no longer invokes Playwright before browser binaries are installed; exact-artifact Playwright remains in the dedicated browser job.
- Added dedicated v6.0.1 runtime and unit regressions. No PDF features or project-package format changes were introduced.

## 6.0.0 — Phase 30 Release Freeze & Final Qualification

- Froze the public web product at `6.0.0`; source builds default to the `release-candidate` channel and the exact `v6.0.0` tag is the only automated stable-channel publication path.
- Centralized `.lpsproject` compatibility for formats v1–v9 and added final migration qualification for project packages, manifests, settings, editor/security/native/compliance state, and Batch v1–v3 recipes.
- Added a final source security/privacy audit covering CSP, cross-origin network sinks, password persistence boundaries, support-bundle scope, and runtime external-resource reporting.
- Added deterministic `release-metadata.json` to every production build so deployed version/channel evidence is machine-verifiable and included in the offline cache.
- Reworked tagged release automation to qualify, reproducibly rebuild, browser-test, deploy, smoke-test, and only then publish the stable GitHub Release.
- Added Phase 30 runtime/unit/release gates with no new PDF functionality.

## 5.9.0-phase29 — Final UX, Accessibility & Performance Polish

- Added SPA route focus/announcement behavior, modal focus trapping/restoration, keyboard document-tab navigation, and stronger viewer semantics.
- Corrected light-theme normal-text contrast and restored the Create PDF Studio textarea focus ring.
- Added high-contrast/forced-colors support, coarse-pointer 44 px targets, 320 px / 200%-zoom layout fallbacks, and off-screen UI containment.
- Added an extreme-document performance budget for 1,000+ pages or 500 MB.
- Added Phase 29 runtime/unit/E2E gates and wired them into CI, Pages deployment, tagged releases, source audit, and release-web qualification.

## 5.8.0-phase28 — Exhaustive Bug Hunt & Data-Loss Audit

- Fixed duplicate-import recovery so transient OPFS/IndexedDB read failures never delete an existing checksum-matching project; suspect local bytes are preserved and the incoming PDF is imported independently.
- Isolated workspace crash heartbeats per tab/session so one tab's clean shutdown cannot erase another tab's interruption evidence.
- Fixed interrupted transaction reconciliation so one derived output can never be assigned to multiple interrupted transactions; ambiguous matches are resolved newest-first and one-to-one.
- Hardened OPFS/IndexedDB failure semantics with writable-stream abort and IndexedDB transaction-abort rejection.
- Upgraded `.lpsproject` format to v9: payload bytes and canonical header metadata now receive independent SHA-256 integrity checks; v1–v8 remain importable.
- Added source-PDF checksum verification before creating a project backup so locally corrupted source bytes are never packaged as a trusted backup.
- Added a 56-file adversarial PDF corpus with PyMuPDF + pypdf validation and low-resolution first/last-page render smoke checks.
- Added Phase 28 failure/recovery unit/runtime/E2E coverage, including 1,000-page progressive rendering, multi-tab crash evidence, and deterministic same-browser vector rendering.
- Wired Phase 28 runtime/corpus gates into CI, GitHub Pages deployment, tagged releases, source audits, and lock-bootstrap release qualification.

## 5.7.0-phase27 — Real Build & CI Qualification

- Froze feature expansion and added exact npm lockfile/toolchain qualification for the stable-web path.
- Added deterministic commit-derived build timestamps and made offline/integrity manifest timestamps reproducible.
- Added full-distribution SHA-256 fingerprinting and CI same-commit rebuild comparison.
- Changed Playwright to support `PLAYWRIGHT_SKIP_BUILD=1`, so browser tests can exercise the exact previously verified `dist` artifact.
- Changed CI browser regression to download the verified build artifact instead of rebuilding it.
- Changed GitHub Pages deployment to run Chromium/Firefox/WebKit plus responsive Playwright qualification against the exact built artifact before upload/deploy.
- Added lockfile integrity/root-pin audit, npm toolchain audit, installed dependency-tree audit, and high-severity npm security gate.
- Synchronized the lock-bootstrap workflow to Phase 27 and the qualified Node/npm toolchain.

## 5.6.0-phase26 — Workflow Intelligence & Automation 3.0

- Added Compare 3.0 hybrid sequence alignment: text fingerprints remain primary for text PDFs while low-resolution perceptual fingerprints identify scan-heavy/image-only pages.
- Added Create PDF Studio 2.0 inline fidelity for Markdown and semantic HTML: bold, italic, bold-italic, inline code, and safe HTTP/mail links survive pagination; searchable PDF links are emitted as link annotations.
- Added Batch 3.0 schema v3 with terminal multi-output steps for fixed-page PDF splitting and PNG page-image ZIP export, including portable-recipe validation and UI ordering safeguards.
- Added Phase 26 unit/runtime/E2E coverage and wired Phase 26 into CI, Pages deployment, tagged-release, source-audit, and stable-web release gates.

## 5.5.0-phase25 — Advanced Web Capabilities

- Added Create PDF Studio for Markdown, plain text, and semantic HTML with A4/A5/custom metric page geometry, reusable style presets, headers/footers/page numbers, searchable Latin/CJK PDF output, and an explicit visual compatibility raster path for shaping-dependent scripts.
- Added Compare 2.0 automatic page-sequence alignment so inserted/deleted pages no longer shift every later comparison pair.
- Added portable Batch 2.0 recipe JSON import/export with schema validation and fresh local recipe IDs.
- Added Phase 25 unit/runtime/E2E coverage and wired the new runtime regression into GitHub Pages CI, deployment, and tagged-release workflows.
- Preserved the static GitHub Pages/PWA architecture: no backend, cloud renderer, or desktop runtime was introduced.

## 5.4.0-phase24 — PWA & Offline Excellence

- Added generated `offline-assets.json` release manifests and complete production runtime precaching, including compiled chunks, workers/WASM, Tesseract runtime, icons, and static assets while excluding source maps.
- Made service-worker navigation/asset serving release-atomic and retained older release caches until the new client reports a healthy boot; older workers do not delete newer waiting-release caches.
- Added offline-cache readiness diagnostics and release validation that requires the complete production asset set, not merely a registered service worker.
- Added install readiness UI with Chromium install prompting, platform-appropriate manual install guidance, persistent-storage requests, offline asset counts, and installed OCR-pack counts.
- Guarded automatic/manual service-worker activation while Phase 21 document operations are active.
- Added progressive PWA File Handling and Launch Handler declarations for PDFs and `.lpsproject` backups.
- Added a local Web Share Target workflow: POSTed files are intercepted by the scoped service worker, staged in a deployment-namespaced Cache Storage inbox, and imported by Home without a backend.
- Added explicit offline OCR behavior: installed/imported packs continue to work offline while network installation controls disable honestly when disconnected.
- Added Phase 24 runtime/unit/PWA E2E coverage and expanded GitHub Pages/PWA readiness auditing to the offline manifest, atomic update handoff, and installed-app ingress paths.

## 5.3.0-phase23 — Phase 23

### Added
- Touch-first document bottom navigation for Read, Edit, Pages, Tools, and a consolidated More sheet.
- Mobile viewer bottom sheet that keeps pages, outline, search, and document information available on phones.
- VisualViewport manager for dynamic app height and software-keyboard insets on mobile browsers.
- Dedicated phone Chromium and tablet WebKit Playwright projects with responsive workflow coverage.
- Responsive layout policy and Phase 23 runtime/unit regression coverage.

### Changed
- Unified workspace uses a flexible column shell so conditional warnings and tool strips cannot displace the document viewport into implicit grid rows.
- Editor side panels default closed on phones and become mutually exclusive bottom sheets above the touch tool rail.
- Touch/coarse-pointer controls receive larger resize handles and minimum target sizes.
- Viewer and editor use the VisualViewport-derived height instead of assuming static `100vh`.
- Organizer controls and thumbnails are tightened for two-column phone workflows.

### Fixed
- Mobile viewer no longer loses pages/search/outline functionality when the desktop sidebar collapses.
- Opening a saved desktop viewer state on a phone no longer forces the sidebar sheet open on launch.
- Software keyboards no longer leave the primary document workspace trapped behind a stale viewport height.
- Mobile editor no longer opens both sidebar and properties panels simultaneously by default.

### Boundaries
- Browser-level pinch zoom is allowed on editor page backgrounds; this is not a replacement for a future native two-pointer canvas zoom gesture.
- Pencil/S Pen input uses Pointer Events and larger touch targets, but pressure/tilt-specific brush dynamics are not claimed.
- Phase 22's lockfile-derived GitHub CI/browser gate is still required before the release-candidate channel can be promoted to stable.

## 5.2.0-phase22 — Phase 22

### Added
- GitHub Pages readiness audit covering Vite repository bases, PWA assets, deterministic deployment installs, service-worker scope, and post-deploy smoke checks.
- Repository-relative PWA identity/start/scope plus 192 px, 512 px, maskable, and Apple touch icons.
- Phase 22 runtime regression coverage for base-path normalization, cache namespaces, GitHub Pages project-site detection, and custom-host behavior.
- Playwright PWA tests for repository-subpath asset resolution and offline application-shell reload.
- A GitHub-hosted lockfile bootstrap workflow that resolves the exact pinned graph, verifies it with `npm ci`, pushes a review branch, and opens a pull request.
- Optional `PAGES_BASE_PATH` repository variable so custom-domain deployments can use `/` while normal project sites default to `/<repository>/`.

### Changed
- CI, Pages deployment, and tagged release workflows now fail closed without `package-lock.json` and use `npm ci` only.
- GitHub Actions are updated to current Node-24-compatible official action lines where applicable.
- Browser regression now builds and runs under the configured GitHub Pages base path instead of validating only the origin root.
- Service-worker registration derives its URL and scope from Vite `BASE_URL`, not the current document path.
- OCR worker/core/language URLs are deployment-base aware.

### Fixed
- Service-worker activation no longer deletes unrelated Cache Storage entries on the same origin.
- Maintenance no longer clears unrelated same-origin caches or unregisters other applications' service workers.
- OCR language caches are namespaced by deployment base, with migration from the legacy cache for matching installed language URLs.
- Release validation now detects deployment-base mismatches and service-worker version/scope mismatches.

### Boundaries
- GitHub Pages project sites under `*.github.io/<repo>/` share an origin with other repositories on the same hostname; URL paths are not a browser storage security boundary. A dedicated custom hostname gives stronger origin isolation.
- This source archive cannot be called fully stable until the exact dependency lock is generated and the official GitHub CI/browser matrix passes.

## 5.1.0-phase21 — Phase 21

### Added
- Per-document operation coordinator for current heavyweight workspace transformations, with one shared progress/cancel surface and cross-context Web Locks when available.
- Navigation and tab-close guards while a document operation is active.
- Browser-storage budget assessment with write overhead and a retained safety reserve before project, derived-revision, and checkpoint persistence.
- Exact commit-time storage checks remain in the repository layer, with cleanup on failed source/project writes.
- Release diagnostics for Web Locks and storage-safety headroom.
- Phase 21 runtime/unit regression coverage for storage budgeting, operation exclusivity, cancellation, and subscriber state.

### Changed
- Current Edit, Pages, Protect, Optimize, OCR, Toolbox, Compliance, Professional, Repair, Preservation, and recovery-checkpoint workflows participate in the shared operation boundary.
- Pausing or cancelling is exposed only where the underlying engine can honor it safely; OCR retains its page/session-aware pause behavior instead of advertising unsafe instant cancellation.
- Application version advanced to `5.1.0-phase21`.

### Boundaries
- Web Locks provide the preferred cross-context operation mutex. Browsers without Web Locks still use project write ownership plus the in-process coordinator, so the coordinator itself is not claimed as a universal cross-process lock.
- `navigator.storage.estimate()` is advisory and may be unavailable or approximate. Actual writes remain rollback-protected and can still fail because of browser/OS quota changes.
- The operation coordinator protects current workspace entry points; low-level repository APIs remain internal primitives rather than a public concurrency contract.

## 5.0.0-phase20 — Phase 20

### Added
- Adaptive viewer performance policy using document size, page count, logical processors, optional device-memory signals, and viewport density.
- Bounded render scheduler shared by page canvases and thumbnails so PDF.js work cannot fan out without limit.
- Automatic large-document safeguards for 250+ pages or 100 MB sources, including tighter canvas scale, activation margins, and off-screen eviction.
- Privacy-safe workspace heartbeat journal that identifies an unclean prior session and pairs with Phase 16 interrupted-transaction reconciliation.
- Runtime health diagnostics for CPU concurrency, optional memory signal, local storage pressure/persistence, viewport density, and desktop-companion presence.
- Versioned desktop-companion bridge contract for optional native save, print, certificate, scanner, and shell integrations.
- Phase 20 productization regression suite.

### Changed
- Main application navigation is reduced to Home, Documents, Tools, Activity, Settings, and Help; storage/maintenance/diagnostics/validation/about move to compact utility links.
- Unified workspace navigation is reorganized around user tasks. Inspect, Repair, and Preservation are advanced technical tools rather than first-class everyday modes.
- Simple/Advanced wording is replaced in-workspace by Core/All tools.
- Rendering profile defaults to Adaptive under settings schema 5.
- Application version advanced to `5.0.0-phase20`.

### Boundaries
- The desktop bridge is an integration contract, not a bundled native host. Browser mode remains fully functional without it.
- Adaptive mode limits concurrent/rendered resources but cannot override browser-level memory limits or guarantee arbitrary-size PDFs fit in memory.
- A heartbeat indicates an unclean workspace close; it is recovery evidence, not proof of data loss.

## 4.3.0-phase19 — Phase 19

### Added
- Recursive professional preflight for page boxes, nested font resources, transparency/overprint, active-content indicators, attachments, output intents, structure trees, and signature fields.
- PDF/A-1b/2b/3b candidate generation with embedded sRGB OutputIntent, PDF/A identification XMP, archival decryption, and reopen verification.
- Accessibility structure-quality grading (`missing`, `baseline`, `partial`, `meaningful`) plus supported Figure Alt, language, top-level order, and form-tooltip repair.
- Embedded signature ByteRange coverage analysis and an explicit external signer-bridge contract without false PAdES claims.
- A4/A3 imposition controls using millimetres, quality presets, booklet direction, crop marks, and registration marks.
- Phase 19 runtime/unit regression coverage and offline caching for the bundled sRGB ICC profile.

### Corrected
- Encrypted compliance documents can be unlocked locally without persisting the password.
- Archival candidate saves remove encryption and validate the generated OutputIntent/XMP after reopening.
- Empty structure roots are no longer described as proof of meaningful reading order.

### Boundaries
- PDF/A candidates still require independent conformance validation.
- PDF/UA is not claimed for baseline or partially tagged documents.
- Signature trust/CMS/PAdES cryptographic validation and certificate-backed signing remain external integration boundaries.


## 4.2.0-phase18 — Phase 18

### Added

- Integrated Toolbox workspace for watermarks, headers, footers, page numbering, CropBox changes, blank-page insertion, and metadata editing/removal.
- Local PDF-to-text, PDF-to-Markdown, PDF-to-HTML, and page-PNG ZIP exports.
- Fixed-page PDF splitting into independently validated PDF parts packaged in a dependency-free UTF-8 ZIP.
- Raster grayscale derived revisions with an explicit structure-loss boundary.
- Latin and CJK static toolbox decorations with Korean, Japanese, Simplified Chinese, and Traditional Chinese CID-font modes.
- Batch 2.0 ordered recipe nodes for rotation, lossless optimization, metadata removal, crop, decoration, blank-page insertion, raster compression, and grayscale conversion.
- Batch recipe v1→v2 migration with deterministic regression coverage.
- Phase 18 pure runtime regression suite and toolbox unit tests.

### Fixed

- Encrypted Toolbox transformations now pass the session password through derived-project reopening validation.
- Encrypted text, Markdown, HTML, and page-image exports now reuse the in-memory session password.
- Footer text and page numbers no longer render on top of one another when both are enabled.
- Batch blank-page counts are normalized before expected-page validation.
- Metadata modification dates are written using PDF date syntax rather than ISO text.

### Changed

- Toolbox transformations participate in the Phase 16 derived-revision transaction model rather than overwriting the source project.
- Batch recipes advanced to schema version 2.
- Toolbox measurements are presented in millimetres while PDF point conversion remains internal.
- Application version advanced to `4.2.0-phase18`.

### Boundaries

- CropBox changes do not securely erase hidden content outside the visible crop.
- Grayscale and page-image exports are raster derivatives and do not preserve interactive PDF structures.
- PDF→Markdown/HTML/text exports are content-focused, not layout reconstruction.
- High-fidelity Office conversion and layout-faithful HTML/Markdown→PDF generation remain deferred rather than being represented by low-quality approximations.

## 4.1.0-phase17 — Phase 17

### Added

- One unified Edit canvas for detected source PDF content and locally added overlay objects.
- Direct source-content selection for existing text, image regions, simple vectors, detected tables, and supported AcroForm widgets.
- Per-object capability levels with confidence, preservation expectations, and explicit risk disclosure.
- Static CJK text reconstruction for Korean, Japanese, Simplified Chinese, and Traditional Chinese using CID fonts, plus optional imported CJK fonts.
- Image contain/cover/stretch replacement with destination geometry controls while source removal remains anchored to original detected bounds.
- Vector restyle, transform, opacity, and deletion controls.
- Full detected-table cell grid editing for Latin/CJK reconstruction with unsafe complex-script cells blocked.
- Interactive form-value editing for supported text, choice, check, and radio fields.
- Phase 17 queue, capability, CJK, form, and legacy-route regression coverage.

### Fixed

- Source-object hitboxes now normalize against non-zero MuPDF page origins for cropped/non-zero-origin pages.
- Moving or resizing an image replacement no longer redirects permanent source removal to the replacement destination.
- CJK table-cell edits now use the CID-font reconstruction path instead of falling through to a Latin font.
- Simple-vector detection now converts raw PDF user-space coordinates into MuPDF/Fitz page coordinates before selection and editing.
- Vector export now converts edited Fitz coordinates back to PDF user space exactly once instead of double-transforming raw content-stream coordinates.
- Table-cell replacements are validated after reopening, not only ordinary text replacements.
- Requested form edits now fail export if they cannot be applied and reopened successfully.

### Changed

- The separate Native Edit workspace is removed from normal navigation; legacy routes redirect to Edit.
- Existing-content edits and overlay compilation now share one validated export pipeline.
- Native editor state schema advanced to 2.
- Project package format advanced to 7.
- Application version advanced to `4.1.0-phase17`.

## 4.0.0-phase16 — Phase 16

### Added

- Immutable project revision lineage and document-transaction journal.
- Project-wide Web Locks ownership with read-only duplicate workspace tabs.
- Preservation graph v2 semantic object fingerprints.
- OCR recipe fingerprints for safe pause/resume.
- Transaction and revision-lineage history in the unified workspace.
- Interrupted transaction reconciliation on project ownership recovery.
- Phase 16 browser regressions for checkpoint identity and duplicate-tab write locking.

### Fixed

- Checkpoint/package restore can no longer deduplicate into and overwrite the source project state.
- Unequal-length PDF comparison now treats absent pages as missing instead of clamping to the shorter document's last page.
- OCR preprocessing changes invalidate incompatible cached pages.
- Preservation checks detect same-count object replacement.
- Repeated checkpoint/package imports remap globally keyed editor assets instead of aliasing earlier restored copies.
- Failed derived commits remove partial output projects before recording rollback.
- Read-only duplicate viewers do not write viewer preferences or project touch timestamps.

### Changed

- Database schema advanced to 13.
- Project schema advanced to 3.
- OCR schema advanced to 2.
- Application version advanced to `4.0.0-phase16`.

## 2.2.0-phase12 — Phase 12

### Added

- Unified `workspace/:projectId/:mode` document route
- Persistent multi-document tab session
- Pin, close, restore, and drag-reorder tab behavior
- Simple and Advanced workspace modes
- Contextual actions and preservation contracts
- Project event timeline
- Integrity-protected full-project checkpoints
- Workspace-aware command palette
- Workspace session, event, and checkpoint IndexedDB stores
- Maintenance detection and cleanup for orphaned workspace data

### Changed

- Project cards now open one workspace instead of exposing separate mode buttons
- Legacy viewer/editor/organizer/security/OCR routes generate unified workspace URLs
- Database schema advanced to 9
- Settings schema advanced to 4
- Application version advanced to `2.2.0-phase12`

### Boundaries

- Mode-specific PDF engines remain lazy modules over the shared project; the canonical preservation-first engine is Phase 13 work.
- Official browser validation still depends on the Phase 11 lockfile and CI gates.

## 2.0.0-rc.4 — Phase 11

### Stability conversion

- Corrected `@playwright/test` from unpublished 1.62.1 to published 1.62.0
- Raised the Node 22 engine floor to 22.12.0 for Vite 8
- Added exact dependency-policy validation
- Added dependency-independent semantic and runtime regression gates
- Added a deterministic 11-file PDF corpus
- Added independent PyMuPDF and pypdf validation
- Added permanent-redaction, AES-256, malformed-input, incremental-save, Unicode, form, annotation, and 200-page fixtures
- Added browser tests for ordinary, encrypted, and large corpus documents
- Hardened CI, GitHub Pages deployment, and stable tagged-release workflows
- Added a manual lockfile-generation workflow
- Stable tags now require a committed `package-lock.json`
- Updated release UI, source audit, documentation, and evidence packaging

### Release status

- Application version advanced to `2.0.0-rc.4`
- Stable `2.0.0` remains blocked until the official npm, Vite, Vitest, Playwright, deployed-browser, and external-reader matrices pass

## 2.0.0-rc.3 — Phase 10

### Added

- SHA-256 output activity receipts with JSON and CSV export
- Session-scoped safe mode
- Maintenance workspace for project health, cache and service-worker recovery, diagnostic cleanup, and settings reset
- Privacy-safe support bundle with optional filenames
- Offline searchable help center and keyboard-shortcut reference
- Global Ctrl/Cmd + K command palette
- Activity-store release-validation task

### Changed

- Database schema advanced to 8
- Settings schema advanced to 3 with v1/v2 migration support
- Source audit now verifies operational privacy and schema boundaries
- Application version advanced to `2.0.0-rc.3`

### Security

- Support bundles exclude document bytes and passwords
- Safe mode suppresses automatic project reopening and service-worker registration
- Checksum mismatches remain non-repairable and require a trusted backup

## 2.0.0-rc.2 — Phase 9

### Added

- Production-facing release-validation workspace
- Dual-engine generated PDF round-trip verification
- Worker, coordinate, IndexedDB, OPFS, Cache API, project-backup, service-worker, and resource-origin checks
- Source-policy audit and distribution-integrity manifest
- Expanded Playwright smoke, privacy, and validation tests
- GitHub Pages post-deployment smoke verification
- Tagged draft-release packaging with source, distribution, and SHA-256 assets

### Changed

- Service-worker cache lifecycle now uses `FetchEvent.waitUntil` for background refresh
- Range requests are excluded from generic runtime caching
- Application version advanced to `2.0.0-rc.2`
- Production sample fixture no longer uses Phase 0 wording

### Security

- Runtime validation reports unexpected cross-origin resource requests
- Stable publication is blocked by failed engine, worker, storage, backup-integrity, or service-worker checks

## 2.0.0-rc.1 — Phase 8

- Release-candidate hardening, integrity-checked project backups, storage health checks, error recovery, controlled PWA updates, privacy/security documentation, and release capability contracts.

## 3.2.0-phase15

- Added native AcroForm field creation and compliance-state persistence.
- Added signature-field inspection and locally verified detached ECDSA evidence.
- Added PDF/A-oriented preparation and four preflight profiles.
- Added accessibility inspection and baseline structure-tree metadata.
- Upgraded `.lpsproject` backups to version 6 with native and compliance state.
