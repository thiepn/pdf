# PDF Studio

PDF Studio is a private, installable PDF workspace that processes documents inside the browser.

**Site:** https://thiepn.github.io/pdf/  
**Repository:** https://github.com/thiepn/pdf

**v6.1.0 is the Intuitiveness & Discoverability release candidate**: it keeps the mature v6 PDF engine and reliability work while simplifying how users find, understand, and move between tools.

## Release status

- **Version:** `6.1.0`
- **Default source channel:** Release candidate
- **Stable promotion:** Qualified `v6.1.0` tag only
- **Hosting:** Static GitHub Pages deployment
- **Processing:** Browser-local
- **Licence:** GNU AGPL-3.0-or-later
- **Qualified CI toolchain:** Node 22.16.0 / npm 10.9.2

Phase 30 established the stable-release qualification model. v6.0.1–v6.0.6 then hardened PWA updates, package validation, schema protection, browser storage, ingress durability, deletion safety, and release provenance. **v6.1.0 does not add PDF capabilities or change persistent formats.** It standardizes product vocabulary, removes duplicate navigation, makes Simple mode genuinely simple, groups editor tools, clarifies staged redaction, replaces technical OCR defaults with understandable quality presets, adds guided page-range examples, hides implementation terminology behind technical details, and expands the bundled offline Help system. Source builds still default to `release-candidate`; only the exact `v6.1.0` GitHub tag workflow builds with `VITE_RELEASE_CHANNEL=stable` after every hard gate passes.

### v6.1.0 interface principles

- One canonical name for each major workflow across navigation, Tools, Viewer, Help, and the command palette.
- Everyday actions stay visible; engineering diagnostics and document-structure details use progressive disclosure.
- Advanced PDF terminology is paired with plain-language labels or moved into expandable technical details.
- Viewer controls remain viewer-specific instead of duplicating workspace navigation.
- Destructive actions explain what is staged, what becomes permanent, and what the exported copy may lose.
- Every major workflow has an offline Help article searchable from the app.

## Core capabilities

### Unified document workspace

- Persistent multi-document tabs with pin, close, restore, and drag reordering
- One task-oriented mode rail for Read, Edit, Pages, Tools, Optimize, Forms & Protect, OCR, Accessibility, and Print & Advanced
- Simple/Advanced tool levels, with Inspect, Repair, and Preservation demoted to a technical strip instead of competing with everyday workflows
- Direct Batch automation entry
- Per-mode preservation contracts
- Project-scoped event, transaction, and checkpoint timeline
- Full local `.lpsproject` checkpoints guaranteed to restore as independent projects
- Workspace-aware command palette

### Local workspace and recovery

- React + TypeScript + Vite
- GitHub Pages CI and deployment workflows with repository-subpath and custom-domain base support
- Complete offline PWA release cache with controlled update activation, repository-scoped cache ownership, and previous-release retention until a healthy new boot
- OPFS source storage with IndexedDB fallback
- Versioned manifest and settings migrations
- Project-wide multi-tab write ownership using Web Locks with an expiring local fallback
- Phase 21 per-document operation coordinator for current heavyweight workspace transformations
- Phase 22 GitHub Pages readiness audit, scoped cache maintenance, PWA install icons, and repository-subpath Playwright matrix
- Phase 23 phone/tablet navigation, VisualViewport keyboard handling, touch-safe editor panels, and dedicated mobile Playwright projects
- Phase 24 complete production-bundle precaching, healthy update handoff, install/persistence readiness, local Web Share Target inbox, and progressive installed-PWA file handling
- Phase 26 Create PDF Studio 2.0 with inline emphasis/code/safe links, Compare 3.0 hybrid text+visual page alignment, and Batch 3.0 terminal multi-output recipes
- Phase 27 exact-lock/toolchain qualification, reproducible distribution fingerprinting, and verified-artifact Playwright deployment gating
- Phase 28 crash/recovery isolation, failure-safe persistence hardening, backup metadata authentication, and 56-file adversarial PDF validation
- Phase 29 final UX/accessibility/performance polish with SPA focus announcements, modal focus management, high-contrast/forced-colors support, 200% zoom resilience, and an extreme-document rendering budget
- Phase 30 release freeze with v1–v9 backup migration qualification, final network/password/support-bundle privacy audit, stable-channel build metadata, and a gated maintenance publication workflow
- v6.0.1 maintenance hardening: build-identity-aware PWA updates, strict package payload ranges, future-schema downgrade refusal, and corrected CI browser qualification ordering
- v6.0.2 maintenance hardening: Stable-channel monotonicity, fail-closed production precaching, post-commit offline health acknowledgement, stricter package structure validation, and Stable-tag source provenance
- v6.0.3 maintenance hardening: durable/atomic PWA share intake, Safe Mode service-worker isolation, semantic backup reference validation, and race-safe Stable-tag provenance
- v6.0.4 Bug Fix Audit 2: import-cleanup isolation, future-schema state protection, safer checksum deduplication, duplicate editor-object validation, and full-history Stable provenance
- v6.0.5 Bug Fix Audit 3: durable installed-PWA file launches, non-destructive offline-shell repair, future project/workspace schema protection, and restored candidate-deploy maintenance coverage
- v6.0.6 Bug Fix Audit 4: future settings/Batch/OCR downgrade protection, durable Share Inbox acknowledgement, source-safe project deletion, and service-worker activation race fix
- Shared operation progress/cancel state with mode/tab navigation guards while work is active
- Storage-budget preflight with a 25 MB / 5% safety reserve before local revision and checkpoint writes
- Project autosave, immutable revision lineage, and transaction recovery state
- Project storage health checks and repairable consistency fixes
- Structured local diagnostics with sanitized technical messages
- Version 9 `.lpsproject` backups with independent SHA-256 payload and canonical-header metadata integrity verification; versions 1–8 remain importable
- Passwords excluded from project packages and diagnostic records

### PDF viewing and organization

- PDF.js rendering, text selection, search, thumbnails, outlines, links, annotations, forms, metadata, and page labels
- Adaptive render scheduling that bounds simultaneous PDF.js page/thumbnail work
- Automatic large-document mode at 250+ pages or 100 MB, plus an extreme mode at 1,000+ pages or 500 MB with serialized rendering, a 1.25× pixel-ratio ceiling, tighter activation margins, and aggressive off-screen eviction
- CSS content-visibility containment for off-screen page shells
- Merge, reorder, rotate, duplicate, delete, reverse, and extract pages
- Shared page-range and exclusion syntax
- Independent output reopening and page-count validation

### Unified editing

- One canvas for detected existing PDF content and newly added editor objects
- Direct selection of existing text, images, simple vectors, detected tables, and supported AcroForm fields
- Capability labels distinguish native-safe, safe reconstruction, appearance-only, and unsupported edits
- Latin fixed-box reconstruction plus static Korean, Japanese, Simplified Chinese, and Traditional Chinese CID-font reconstruction
- Optional imported CJK TrueType/OpenType fonts
- Image contain/cover/stretch replacement with editable geometry and optional permanent underlying-content removal
- Vector restyle, transform, opacity, and deletion controls for supported detected paths
- Full detected-table cell grid editing rather than first-cell-only editing
- Interactive text/choice/check/radio field value editing without flattening
- Text, images, shapes, ink, highlights, comments, links, stamps, visual signatures, and redaction overlays remain available in the same editor
- Shared local autosave and a single native-content → overlay → reopen-validation export pipeline

### Forms and security

- Existing form filling and flattening
- Permanent redaction with full-save cleanup
- Metadata, JavaScript, automatic-action, attachment, link, comment, and form-data sanitization
- AES-256 protection and PDF permission controls
- Security inspector and signature-field detection
- Security-critical export validation before output release

### OCR and scanning

- Local Tesseract worker and WebAssembly assets
- Explicit language-pack installation, import, removal, and offline caching
- English, German, French, Korean, Simplified Chinese, Arabic, Spanish, Italian, and Turkish options
- Grayscale, brightness, contrast, threshold, inversion, and scaling preprocessing
- Page-level progress, pause, cancellation, failure isolation, persistence, and recipe-safe recovery
- Searchable raster PDF generation and extracted-text validation
- Scan-to-PDF from images or camera capture

### Advanced and professional tools

- Lossless and raster compression profiles
- Batch 3.0 ordered local recipes with rotate, optimize, metadata removal, crop, decoration, blank-page insertion, raster compression, grayscale, terminal PDF splitting, and terminal page-image ZIP export
- Visual and text comparison with explicit missing-page handling plus hybrid text/visual sequence alignment for scan-heavy documents
- Structural inspection and JSON reports
- Clean-copy repair
- Existing-text redact-and-replace and overlay modes
- Region-based image replacement
- Bates numbering
- 2-up, 4-up, and booklet imposition
- Optional-content layer visibility controls
- PDF/A-1b/2b/3b candidate preparation with archival XMP, embedded sRGB OutputIntent, encryption removal, and post-export structural verification
- Accessibility structure-quality inspection with supported Alt/Lang/top-level reading-order/form-tooltip repair
- Embedded signature-field ByteRange coverage analysis (current file vs prior revision)
- Text-focused DOCX export
- Integrated Toolbox mode for watermarks, headers, footers, page numbers, CropBox editing, blank-page insertion, and metadata editing/removal
- Local PDF exports to plain text, Markdown, standalone HTML, and page PNG ZIPs
- Fixed-page PDF splitting to a local ZIP without uploading the source
- Raster grayscale derived revisions with an explicit interactive-structure loss boundary
- Latin and CJK static decorations with selectable Korean/Japanese/Simplified-Chinese/Traditional-Chinese CID-font handling


### Operational maturity

- Workspace heartbeat journal identifies sessions that ended without a clean close and surfaces recovery guidance without storing document contents
- Runtime diagnostics report logical processors, optional device-memory signals, storage pressure/persistence, and desktop-companion status
- Optional desktop bridge contract v1 defines native file save, print, certificate signing, scanner, and shell-integration capability boundaries while browser fallbacks remain primary

- Local output activity receipts with SHA-256 checksums and bounded retention
- JSON and CSV receipt export without retaining document contents
- Session-scoped safe mode that suppresses automatic project reopening and service-worker registration
- Maintenance workspace for project health, safe repairs, cache recovery, service-worker reset, and support bundles
- Offline searchable help center and keyboard-shortcut reference
- Global Ctrl/Cmd + K command palette

### Production validation

- Dedicated `#/validation` workspace
- Dual-engine generated-PDF round trip
- Worker, coordinate, IndexedDB, OPFS, Cache API, and service-worker checks
- Version 9 project-package payload and metadata corruption rejection
- Same-origin resource audit and downloadable JSON evidence
- Source and distribution release audits
- Post-deployment smoke verification and tagged-release checksums
- Reproducible Phase 11 PDF corpus plus a Phase 28 adversarial corpus of 56 fixtures covering malformed input, encryption, forms, annotations, CJK/RTL, unusual geometry, incremental revisions, attachments, transparency, large page counts, images, vectors, and render smoke validation
- Independent validation through PyMuPDF and pypdf
- Offline internal semantic checking and pure runtime regression for restricted environments
- Stable tags require a committed dependency lock and the full official browser gate

## Preservation boundaries

Some operations intentionally rebuild document pages:

- OCR output is a searchable raster reconstruction.
- Raster compression and imposition create image-based pages.
- These outputs do not preserve original interactive forms, links, annotations, cryptographic signatures, optional-content layers, or vector editability.
- Lossless optimization, secure tools, inspection, repair, ordinary editing, and non-raster Toolbox transforms operate on the PDF structure, subject to each tool’s displayed limitations.
- Toolbox grayscale intentionally rasterizes pages; split ZIP export creates independent documents from page ranges.

The application does not claim universal Word-like PDF text reflow, high-fidelity PDF↔Office conversion, layout-faithful HTML/Markdown→PDF generation, handwriting OCR, certified PDF/A conversion, password cracking, or browser-based certificate signing.

## Run locally

```bash
npm install
npm run dev
```

The `predev` and `prebuild` scripts copy Tesseract’s browser worker and WebAssembly core files into `public/tesseract` so executable OCR assets are served locally.

## Validate

Run the dependency-independent Phase 11 gate first:

```bash
python -m pip install -r requirements-phase11.txt
npm run gate:phase11
```

After the exact lockfile is committed and dependencies are installed with `npm ci`, the complete local qualification command is:

```bash
npm run release:check
```

That command runs the historical stability/regression gates, lock/toolchain/dependency audits, official TypeScript and Vitest checks, a verified production build, high-severity dependency audit, and Playwright against the already-built `dist`. Install the required Playwright browsers first with `npx playwright install chromium firefox webkit`.

A release-qualified build requires a committed `package-lock.json`; the manual **Bootstrap dependency lock** workflow generates it from the exact pinned `package.json`, verifies it with `npm ci`, and opens a review PR.

## Deploy to GitHub Pages

1. Create a GitHub repository and upload this project.
2. Run **Actions → Bootstrap dependency lock**.
3. Merge the generated dependency-lock PR only after its clean-install checks pass.
4. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
5. Push or merge to `main`.

Main-branch Pages deployments remain explicitly **release-candidate** builds. They derive the repository subpath, use deterministic commit metadata, run the complete PDF/runtime/adversarial-corpus/type/unit/build gates, browser-test the exact verified `dist`, and only then publish it. To promote the frozen source to stable, create the exact `v6.0.6` tag only after the dependency-lock PR is merged; the tagged workflow rebuilds with `VITE_RELEASE_CHANNEL=stable`, proves reproducibility, reruns the full browser/security gates, deploys that exact artifact to Pages, smoke-tests the live site, and only then publishes the GitHub Release.

## Privacy

The application contains no document-upload endpoint. PDF bytes, extracted text, OCR results, editor objects, form values, passwords, imported images, signature appearances, and generated output remain local. OCR language packs are downloaded only after explicit user action from the configured tessdata host or imported from a local file.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Documentation

- [Known limitations](KNOWN_LIMITATIONS.md)
- [Security policy](SECURITY.md)
- [Privacy model](PRIVACY.md)
- [Contribution guide](CONTRIBUTING.md)
- [Phase 11 engineering specification](docs/phase-11/README.md)
- [Phase 11 acceptance matrix](docs/phase-11/acceptance-matrix.md)
- [Phase 11 corpus validation report](docs/phase-11/corpus-validation-report.json)
- [Phase 12 engineering specification](docs/phase-12/README.md)
- [Phase 12 acceptance matrix](docs/phase-12/acceptance-matrix.md)
- [Phase 12 build audit](docs/phase-12/reports-build-2.2.0-phase12.md)
- [Phase 18 engineering specification](docs/phase-18/README.md)
- [Phase 18 acceptance matrix](docs/phase-18/acceptance-matrix.md)
- [Phase 19 engineering specification](docs/phase-19/README.md)
- [Phase 19 acceptance matrix](docs/phase-19/acceptance-matrix.md)
- [Phase 20 engineering specification](docs/phase-20/README.md)
- [Phase 20 acceptance matrix](docs/phase-20/acceptance-matrix.md)
- [Phase 20 build report](docs/phase-20/build-report-5.0.0-phase20.md)
- [Phase 21 engineering specification](docs/phase-21/README.md)
- [Phase 21 acceptance matrix](docs/phase-21/acceptance-matrix.md)
- [Phase 21 build report](docs/phase-21/build-report-5.1.0-phase21.md)
- [Phase 22 engineering specification](docs/phase-22/README.md)
- [Phase 22 acceptance matrix](docs/phase-22/acceptance-matrix.md)
- [Phase 22 GitHub Pages deployment guide](docs/phase-22/github-pages-deployment.md)
- [Phase 22 build report](docs/phase-22/build-report-5.2.0-phase22.md)
- [Phase 23 engineering specification](docs/phase-23/phase-23-spec.md)
- [Phase 23 acceptance matrix](docs/phase-23/acceptance-matrix.md)
- [Phase 23 build report](docs/phase-23/build-report-5.3.0-phase23.md)
- [Phase 24 engineering specification](docs/phase-24/phase-24-spec.md)
- [Phase 24 acceptance matrix](docs/phase-24/acceptance-matrix.md)
- [Phase 24 build report](docs/phase-24/build-report-5.4.0-phase24.md)
- [Phase 25 engineering specification](docs/phase-25/phase-25-spec.md)
- [Phase 25 acceptance matrix](docs/phase-25/acceptance-matrix.md)
- [Phase 25 build report](docs/phase-25/build-report-5.5.0-phase25.md)
- [Phase 26 engineering specification](docs/phase-26/phase-26-spec.md)
- [Phase 26 acceptance matrix](docs/phase-26/acceptance-matrix.md)
- [Phase 26 build report](docs/phase-26/build-report-5.6.0-phase26.md)
- [Phase 27 engineering specification](docs/phase-27/phase-27-spec.md)
- [Phase 27 acceptance matrix](docs/phase-27/acceptance-matrix.md)
- [Phase 27 build report](docs/phase-27/build-report-5.7.0-phase27.md)
- [Phase 28 engineering specification](docs/phase-28/phase-28-spec.md)
- [Phase 28 acceptance matrix](docs/phase-28/acceptance-matrix.md)
- [Phase 28 data-loss audit](docs/phase-28/data-loss-audit.md)
- [Phase 28 build report](docs/phase-28/build-report-5.8.0-phase28.md)
- [Phase 28 adversarial corpus report](docs/phase-28/adversarial-corpus-report.json)
- [Phase 29 engineering specification](docs/phase-29/phase-29-spec.md)
- [Phase 29 acceptance matrix](docs/phase-29/acceptance-matrix.md)
- [Phase 29 UX/accessibility audit](docs/phase-29/ux-accessibility-audit.md)
- [Phase 29 performance budget](docs/phase-29/performance-budget.md)
- [Phase 29 build report](docs/phase-29/build-report-5.9.0-phase29.md)
- [Phase 11 build audit](docs/phase-11/reports-build-2.0.0-rc.4.md)
- [Phase 30 release-freeze specification](docs/phase-30/phase-30-spec.md)
- [Phase 30 acceptance matrix](docs/phase-30/acceptance-matrix.md)
- [Phase 30 migration/security audit](docs/phase-30/migration-security-audit.md)
- [Phase 30 final qualification report](docs/phase-30/final-qualification-report.md)
- [Phase 30 build report](docs/phase-30/build-report-6.0.0.md)
- [v6.0.2 maintenance report](docs/releases/v6.0.2/maintenance-report.md)
- [v6.0.3 maintenance report](docs/releases/v6.0.3/maintenance-report.md)
- [v6.0.4 Bug Fix Audit 2 report](docs/releases/v6.0.4/maintenance-report.md)
- [v6.0.5 Bug Fix Audit 3 report](docs/releases/v6.0.5/maintenance-report.md)
- [v6.0.6 Bug Fix Audit 4 report](docs/releases/v6.0.6/maintenance-report.md)
- [v6.0.1 maintenance report](docs/releases/v6.0.1/maintenance-report.md)
- [Stable release checklist](docs/phase-11/stable-release-checklist.md)

## Licence

The repository uses **GNU AGPL-3.0-or-later** because MuPDF is included under AGPL. Retain the licence and third-party notices when redistributing the application.

## Phase 14–24 additions

- Native text, image, simple-vector, and table-cell editing with safe capability classification
- Preservation graph and vector imposition workspace
- Native AcroForm field creator
- Signature-field inspection and verified detached ECDSA evidence
- qualified PDF/A candidate preparation, semantic accessibility inspection/repair, signature coverage analysis, and deeper archival/print/security preflight
- Version 9 project backups including native/compliance state plus authenticated header metadata
- Adaptive large-document rendering and bounded page/thumbnail concurrency
- Workspace interruption heartbeat and runtime health diagnostics
- Optional desktop-companion bridge contract v1
- Fail-safe per-document operation coordination and browser-storage reserve preflight
- GitHub Pages repository-subpath/PWA release qualification and same-origin cache isolation
- Touch-first phone/tablet workspace and responsive browser matrix
- Complete production offline precaching, healthy service-worker update handoff, install/persistence readiness, and progressive PWA file/share entry

- [Phase 14 status](PHASE14_STATUS.md)
- [Phase 15 status](PHASE15_STATUS.md)
- [Phase 15 specification](docs/phase-15/README.md)
- [Phase 16 status](PHASE16_STATUS.md)
- [Phase 16 reliability specification](docs/phase-16/README.md)
- [Phase 16 acceptance matrix](docs/phase-16/acceptance-matrix.md)
- [Phase 20 status](PHASE20_STATUS.md)
- [Phase 21 status](PHASE21_STATUS.md)
- [Phase 22 status](PHASE22_STATUS.md)
- [Phase 23 status](PHASE23_STATUS.md)
- [Phase 24 status](PHASE24_STATUS.md)
- [Phase 25 status](PHASE25_STATUS.md)
- [Phase 26 status](PHASE26_STATUS.md)
- [Phase 27 status](PHASE27_STATUS.md)
- [Phase 28 status](PHASE28_STATUS.md)
- [Phase 29 status](PHASE29_STATUS.md)
- [Phase 30 status](PHASE30_STATUS.md)
