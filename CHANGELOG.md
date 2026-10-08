# Changelog

## Unreleased — v7.2 development line

### P17 — Deep Native-Content Fidelity

- Adds specialist existing-image inspection using MuPDF paint tracing plus source mask metadata instead of treating every image rectangle as equally editable.
- Qualifies plain/shared image edits and attached-soft-mask source transform/deletion, with action-level capability rules and post-save mask/untouched-instance validation; explicit masks, inherited clipping, non-Normal blending, and ambiguous image state fail closed.
- Keeps shared-image edits instance-local rather than mutating a reusable source image resource.
- Protects vector appearance override when the source depends on clipping, non-Normal blend state, Pattern/Lab/Indexed/Separation/unknown color state, while preserving the geometry-only path that retains inherited graphics state.
- Classifies regular, nonuniform, merged, irregular, and merged-irregular detected tables and rejects overlapping, out-of-grid, or uncovered reconstruction geometry.
- Extends paragraph flow to a uniquely detected two-region thread with deterministic adjacency, blocker, width, and page-boundary rules; arbitrary cross-page/multi-region reflow remains outside scope.
- Adds a deterministic source-generated P17 PDF fixture plus focused policy, reflow, and browser qualification; native export remains gated by the existing P8 source/output fidelity validator.
- Leaves executable version `7.1.4` and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P18: Compatibility and Human/Device Qualification (V72-06).

### P16 — Batch Parity & Encrypted-Queue Ergonomics

- Evolves portable Batch recipes from schema v3 to **v4** with deterministic migration of existing v2/v3 ordered steps; project/package, IndexedDB, and native-editor schemas remain unchanged.
- Adds reusable **Extract pages**, **Remove pages**, **Flatten forms/annotations**, **Clean risky content**, and **Compress to target size** recipe steps.
- Adds a checked standalone→Batch capability matrix so multi-input composition, OCR review, repair/recovery, DOCX/text export, and output-password creation remain explicit boundaries rather than silent gaps.
- Reuses P15 bounded target-size compression in Batch; structure-preserving target results remain P8 fidelity-gated before downstream steps can consume them.
- Adds per-file encrypted-queue recovery: protected PDFs enter a recoverable Password required state and accept a credential only after local reopen validation.
- Keeps plaintext input credentials in an in-memory map owned by the open Batch page. They are cleared on forget/remove/clear/unmount and never enter recipe JSON, project packages, output names, or queue messages.
- Tracks actual encryption state after PDF rewrites instead of blindly forwarding a stale source password to later steps.
- Extends stale-output validity to recipe fingerprint + input identity + session-credential revision.
- Keeps terminal split/page-image steps final and documents deterministic inner ZIP names plus queue-order outer ZIP naming.
- Leaves executable version `7.1.4` and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P17: Deep Native-Content Fidelity (V72-05).

### P15 — Structure-Preserving Target-Size Compression

- Adds byte, KB, and MB target-size input to the Compression tool.
- Always tries structure-preserving MuPDF optimization before considering any destructive raster fallback.
- Adds a strict **Keep PDF structure** preference that never rasterizes and returns honest best effort/refusal when the target cannot be reached safely.
- Adds a **Prioritize the target** preference with five progressively stronger raster fallbacks, capped at six total attempts including the structural pass.
- Reports source, target, best-output bytes, attempt count, target-met/best-effort/refusal status, and an explicit preservation summary.
- Selects the first target-hitting raster result at the highest tested fidelity and otherwise offers only the smallest real improvement.
- Never labels an output at or above the source size as successful target-size compression.
- Keeps processing browser-local, adds no backend, and leaves executable version `7.1.4` and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P16: Batch Parity & Encrypted-Queue Ergonomics.

### P14 — Complex-Script Existing-Text Editing

- Qualifies Arabic-script/RTL existing-text replacement as a dedicated fixed-box reconstruction path rather than generic appearance-only editing.
- Adds `harfbuzzjs@1.6.2` for real contextual shaping, ligatures, advances and mark offsets.
- Adds `bidi-js@1.1.0` for Unicode bidirectional embedding levels, visual run order and mirroring in mixed Arabic/Latin/number text.
- Requires a local imported TTF/OTF that passes MuPDF parsing and current-text glyph coverage before Apply is enabled.
- Embeds the selected font through MuPDF's Identity-H CID font path and writes shaped glyph IDs instead of unshaped Unicode character operators.
- Wraps shaped lines with logical UTF-16BE `/ActualText` so copy/search semantics remain logical rather than visual glyph order.
- Fails closed on explicit bidi controls, unrelated complex scripts, missing font coverage and shaped fixed-box overflow.
- Keeps Arabic layout expansion and automatic Find/Replace disabled pending separate RTL-specific evidence.
- Leaves executable version `7.1.4` and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P15: Structure-Preserving Target-Size Compression.

### P13 — Layout-Aware PDF → DOCX Export 2.0

- Replaces the text-only PDF→DOCX paragraph dump with local layout-aware reconstruction.
- Reuses native PDF inspection for paragraph runs, detected tables, page geometry, image regions, and conservative text-flow metadata.
- Emits editable Word paragraphs with supported font name, size, bold/italic, color, alignment, RTL flags, and source-informed spacing.
- Converts qualified detected tables into real Word tables, including common horizontal/vertical merge semantics, without duplicating table text into the paragraph stream.
- Embeds bounded detected image regions as separate PNG media objects using local PDF.js page rendering instead of flattening whole pages.
- Preserves selected-page boundaries and source-informed page size/orientation/margins through Word section properties.
- Reports heuristic multi-column order, skipped complex tables/images, and omitted vector/nested artwork instead of claiming pixel-identical Office fidelity.
- Keeps conversion fully local, adds no Office/cloud conversion service, and adds no runtime dependency.
- Leaves executable version `7.1.4` and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P14: Complex-Script Existing-Text Editing.

### P12 — Product roadmap & feature intake

- Rebaselines v7.2 against the current v7.1 product instead of stale historical gap lists.
- Records visual page composition, source-preserving OCR 2.0, and P8 fidelity gating as already shipped rather than re-planning them.
- Commits six net-new v7.2 outcomes: layout-aware editable PDF→DOCX export, complex-script existing-text editing, structure-preserving target-size compression, Batch parity/encrypted-queue ergonomics, deeper native-content fidelity, and compatibility/human-device qualification.
- Keeps DOCX→PDF, independent PDF/A validation, and dedicated two-pointer document zoom as evidence-gated candidates.
- Defers broad XLSX/PPTX parity, certificate-backed/PAdES signing, universal PDF/UA reconstruction, unrestricted content-stream rewriting, and enterprise/native platform expansion.
- Adds a machine-readable P12 intake contract, source-anchored roadmap audit, unit contract tests, and dedicated CI.
- Leaves executable version `7.1.4`, target version `7.2.0`, and persistent formats 9 / 13 / 6 unchanged.
- Hands implementation to P13: Layout-Aware PDF → DOCX Export 2.0.

### P11 — Development-line foundation

- Declares `7.2.0` as the next release target without changing the executable `7.1.4` package/runtime identity before Stable publication is complete.
- Adds a machine-readable P11 next-line manifest separating future v7.2 work from frozen P9/P10 v7.1.4 evidence.
- Requires the real `v7.1.4-post-release-certificate` before an atomic v7.2 version cut can occur.
- Keeps `.lpsproject` v9, IndexedDB schema v13, and native-editor schema v6 unchanged.
- Adds dedicated P11 audit, version-cut readiness tests, and CI coverage.
- Preserves the exact v7.1.4 Stable/tag/promotion workflows rather than repurposing them for v7.2.

## 7.1.4 — Task-first PDF Tools & Release Candidate

### Product hardening

- **P1 Existing-Content Editing Excellence:** safer find/replace, style-aware fit/reflow, exact source-span removal, background preservation, imported-font preflight, original-vs-edited verification, and history-synchronized properties.
- **P2 Intelligent Document Entry:** deterministic local document evidence recommends 2–4 existing tasks without an AI/chat dependency and without delaying document opening.
- **P3 OCR 2.0 / Scan-to-Editable:** keeps original page artwork, persists local OCR evidence/corrections, supports region OCR, appends invisible searchable text, and continues into Edit as a derived copy.
- **P4 Native File Workflow:** progressive native Open/Save/Save As, explicit Replace original, linked-file conflict protection, download fallback, and external `.lpsproject` backup folders.
- **P5 Trust & Output Verification:** shared measured verification evidence, honest sampled checks, and explicit lossy-operation consequences across major workflows.
- **P6 Mobile Interaction Excellence:** shifted VisualViewport/keyboard handling, 44 px touch targets, and touch-complete page reordering without requiring HTML drag-and-drop.
- **P7 Forms & Redaction Excellence:** reviewed interactive text/checkbox creation plus local sensitive-content discovery that only becomes permanent through the validated redaction writer.
- **P8 Fidelity & Compatibility:** mandatory pre-publication fidelity gates with exact intent-aware structural expectations and deterministic bounded untouched-page checks.

### Editor defect hardening

- Enforces locked added objects as a real editor protection boundary across properties, keyboard movement, layout actions, duplication, deletion, grouping, layer order, and Cut while keeping visibility toggles independently usable.
- Keeps the Properties panel synchronized with actual selection state on compact/mobile layouts, including tool changes, empty-canvas clicks, Escape, deletion, additive deselection, and Undo/Redo restoration.
- Adds page-scoped Ctrl/Cmd+A selection for visible added objects and selectable existing-PDF content without overriding normal text-field selection.
- Adds safe Ctrl/Cmd+X Cut for objects added in PDF Studio with immediate internal clipboard support, Undo/Redo/Paste history, full refusal for mixed selections containing original PDF content, and locked-object protection.

### Release certification

- Freezes the current P1–P8 roadmap in a machine-checked P9 release manifest.
- Retains all historical v6 maintenance and v7 universal-editing regression gates underneath the current product-hardening stack.
- Requires exact-lock/toolchain/dependency/security audits, independent compatibility-corpus opening, TypeScript/unit qualification, verified distribution auditing, repeat-build fingerprint identity, and exact-artifact browser testing.
- Release completion qualifies both release-candidate and stable channels across Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit with zero retries and emits the exact-head `v7.1.4-release-certificate`.
- Stable publication remains exact-tag and main-ancestry gated, deploys the already qualified artifact, smoke-tests the live PWA identity, and only then publishes the GitHub Release.
- Stable release assets now include curated release notes, the P9 freeze/qualification documents, release metadata/integrity evidence, licence inventory, corpus reports, source/distribution archives, and SHA-256 checksums.
- Project package remains v9, database schema v13, and native-editor schema v6.

## 7.1.3 — Task-first PDF Tools & Release Candidate

- Clears hidden existing-PDF selections immediately when queued deletion edits remove text, images, vectors, tables, or complex content from the canvas.
- Keeps the native properties panel synchronized with what is actually visible after deletion instead of leaving a hidden deleted object selected.
- Restores the deleted source object, active selection, and properties panel together on Undo, then clears them again consistently on Redo.
- Centralizes hidden native-object detection in the native edit queue so canvas hit-testing and selection cleanup use the same deletion semantics.
- Adds unit and browser regressions for deletion-selection cleanup and Undo/Redo restoration without changing project package v9, database schema v13, or native-editor schema v6.

## 7.1.2 — Task-first PDF Tools & Release Candidate

- Restores existing-PDF selection state through Undo/Redo alongside objects added in PDF Studio.
- Restores the transaction page through Undo/Redo so recovered selections are visible instead of remaining selected off-screen on another page.
- Makes mixed existing-PDF and added-object operations preserve the same working context before and after history traversal.
- Makes add, duplicate, paste, and delete transactions record their intended post-operation native-selection state instead of relying on out-of-band UI state.
- Adds unit and browser regressions for delete → Undo → restored selected source object → Redo, including page-context restoration.
- Preserves project package v9, database schema v13, and native-editor schema v6; this maintenance release requires no storage migration.

## 7.1.1 — Task-first PDF Tools & Release Candidate

- Fixed Undo/Redo so edits to existing PDF text, images, vectors, tables, and complex page content share the same history as objects added in PDF Studio.
- Added live rendered previews for queued existing-content edits so the canvas reflects the PDF that will actually be exported.
- Made mixed native-and-added-object operations atomic, including move, alignment, rotation, and deletion, while avoiding duplicate embedded font bytes in history snapshots.
- Added safe deletion for editable source text from both the properties panel and the Delete key, while continuing to block unsafe appearance-only text removal.
- Removed stale selection hitboxes after deleting existing PDF content and restored them correctly on Undo.
- Excluded hidden added objects from exported PDFs and locked editor mutations during export so the downloaded file matches the visible transaction snapshot.
- Added browser regressions that edit, preview, Undo/Redo, export, reopen, and inspect the resulting PDF across the qualified browser matrix.
- Preserved project package v9, database schema v13, and native-editor schema v6; this is a reliability hotfix, not a storage migration.

## 7.1.0 — Task-first PDF Tools & Release Candidate

- Rebuilt the homepage, focused tools, document shell, and mobile navigation around tasks rather than document/workspace tabs.
- Added twenty-one download-first tasks, compatible file-first routing, and validated edited-document handoff between tools.
- Added native-page/mixed-image assembly with insertion, replacement, duplex interleaving, blank pages, output-order previews, and undo/redo; added visual cropping and batch outputs.
- Added editable text-only DOCX export while keeping full-layout Office conversion explicitly unsupported.
- Completed direct reader fit-width/fit-page, search, page entry, layout, and original-download controls with light/dark and touch layouts.
- Fixed lost hash navigation, stale automatic project reopening, reading-position restoration, viewport containment, hidden compact-layout controls, and stale search results.
- Expanded real-PDF browser coverage across Chromium, Firefox, WebKit, phone, and tablet profiles, including downloaded bytes, edited handoff, form values, and output geometry.
- Preserved existing project/database/native-editor schemas and the exact dependency graph. Stable v7.0.0 is not overwritten or retagged; v7.1.0 must pass its own release, deployment, and smoke gates.

## 7.0.0 — Universal Editing Release Candidate

- Promoted P1–P8 into one feature-frozen existing-content editing architecture.
- Added exact existing-text editing with layout-aware paragraph reflow, font/style preservation evidence, and deterministic downstream movement for supported layouts.
- Added direct source-image manipulation, exact vector-path editing, structured table reconstruction, and supported reusable nested Form XObject instance transforms/deletion.
- Unified added editor objects and qualified source PDF objects under shared move, resize, alignment, distribution, rotation, and keyboard layout operations.
- Added source-vs-output fidelity certification for page geometry, untouched sampled semantics, annotations/widgets, forms, attachments, outlines, labels, JavaScript presence, encryption state, core metadata, and compatibility-significant PDF container features.
- Added a nine-class P8 compatibility corpus independently reopened by PyMuPDF and pypdf, plus Chromium/Firefox/WebKit editor/export regression coverage.
- Preserved project package v9, database schema v13, and backward compatibility with supported v1–v9 project packages; v7 is a capability release, not a storage-format migration.
- Froze v7.0.0 publication behind the P9 release-candidate audit, existing Phase 11–30 and v6 maintenance regressions, reproducible distribution checks, dependency/security gates, exact-artifact Playwright qualification, deployed smoke tests, and exact-tag Stable provenance.

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
