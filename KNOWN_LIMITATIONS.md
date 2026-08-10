# Known Limitations

- OCR creates searchable raster reconstructions rather than adding an invisible layer to the original page structure.
- Tesseract targets printed text. Handwriting recognition is not claimed.
- Existing static text replacement supports bounded Latin reconstruction and CJK CID-font reconstruction. Arabic, Indic, RTL, and other shaping-dependent scripts remain an appearance-only fallback until a shaping/bidi engine is integrated.
- Paragraph reflow across neighboring objects/columns/pages and universal arbitrary content-stream rewriting are not implemented.
- Image replacement is region-based and may not preserve original masks, clipping, blend modes, or shared-image semantics.
- Raster compression and imposition do not preserve interactive or vector structures.
- Batch recipes do not yet expose every standalone tool.
- Compare 3.0 aligns page sequences with text fingerprints and low-resolution visual fallback, but visually repetitive scans/forms or extreme page counts can still require manual pair selection.
- Repair cannot recover every truncated or fundamentally unreadable PDF.
- Archival analysis is not certified PDF/A conformance.
- DOCX export prioritizes editable text over visual fidelity.
- Visual signatures are not cryptographic signatures.
- Browser certificate signing remains deferred.
- The in-app release validation proves the deployed runtime foundation only; external-reader, mobile, print, large-corpus, malformed-file, and adversarial security validation remain required before removing the release-candidate designation.

- Activity receipts prove the bytes downloaded by this browser session; they do not provide a cryptographic signature or trusted timestamp.
- Clearing browser site data removes receipts, diagnostics, and local projects unless external backups exist.
- Safe mode is session-scoped and does not repair damaged PDF source bytes.

## Phase 19 standards boundary

- PDF/A output is a **candidate preparation workflow**, not an ISO conformance certificate. Phase 19 can remove encryption, embed the bundled sRGB output intent, add PDF/A identification XMP, remove supported active content, subset supported fonts, and verify those structures survived reopening; independent validation remains mandatory.
- PDF/A profile-specific edge cases outside the implemented preflight rules can still require a dedicated standards validator.
- Accessibility repair works on semantic structure that already exists. Creating an empty baseline `StructTreeRoot` does not make an untagged PDF accessible and is reported as `baseline`, not `meaningful`.
- Phase 19 does not automatically infer a complete PDF/UA structure tree from arbitrary visual content.
- Signature inspection validates local ByteRange syntax/coverage boundaries. It does not claim certificate trust, revocation, timestamp-authority, CMS, or full PAdES cryptographic validation.
- Embedded certificate-backed PAdES signing remains an integration boundary exposed through the signer-bridge contract; the app does not fabricate a browser-only signature.
- Print imposition is still a raster derivative and can lose text searchability, forms, links, tags, annotations, layers, and original vector fidelity.

## Phase 11 stable-release gate

- The packaged source has no committed `package-lock.json` because the current execution environment cannot access the official npm registry. Stable tags are configured to fail until a lockfile is generated and committed.
- The dependency-independent semantic check uses intentionally broad declarations and does not replace official package typings.
- PyMuPDF and pypdf validation proves corpus-level structural behavior, not browser execution of PDF.js, MuPDF WebAssembly, or Tesseract.
- Adobe Reader, PDF24, macOS Preview, mobile readers, and physical print output still require recorded external validation.

## Unified workspace boundary

The workspace now includes Phase 16 revision/transaction lineage and object-level preservation fingerprints, while Phase 17 unifies the primary editing surface. Specialist engines still initialize lazily and some transformations remain engine-specific rather than operating through one universal mutable PDF object model.

## Phase 15 compliance

- Certificate-backed PAdES signing is not yet available in the browser build. Detached ECDSA evidence is exported separately.
- PDF/A-oriented preparation is not a conformance certificate.
- Baseline tagging creates metadata and a structure-tree root, not meaningful semantic tags for page content.
- Print preflight does not yet inspect complete bleed, trim, overprint, separations, or ICC output intents.
- XFA forms and unrestricted PDF JavaScript are not supported.
## Unified existing-content editor

- Technical edit-confidence details are available under expandable details; they are implementation guidance, not PDF conformance or preservation guarantees.
- CJK replacement may use a different font from the source, so exact glyph metrics can change within the fixed box.
- Complex-script editable visual-text fallback depends on reader/font support and is not claimed as static shaped text.
- Simple-vector detection is deliberately conservative and does not yet discover arbitrary nested paths, clipping stacks, shadings, patterns, or inherited graphics state.
- Table detection is geometric/inferred and does not understand every merged-cell or semantic table structure.
- AcroForm value editing is supported for common fields; signatures, XFA, read-only fields, and unsupported widget types are not mutated.


## PDF tools and batch automation

- Crop changes the visible CropBox. It does **not** securely erase PDF objects outside the crop; use permanent redaction/sanitization for confidential material.
- Watermark/header/footer/page-number output is static PDF text. Latin and CJK CID-font paths are supported; shaping-dependent scripts are not statically reconstructed by the Toolbox writer.
- PDF → text/Markdown/HTML exports preserve extracted textual content, not typography, columns, floating objects, exact tables, or original pagination geometry.
- Page-image ZIP and grayscale PDF are raster outputs. Grayscale derived PDFs intentionally lose original searchable text, forms, links, annotations, layers, signatures, and vector editability.
- Fixed-page split creates independent PDFs; whole-document bookmarks, signatures, attachments, and cross-part relationships may not remain meaningful across the resulting files.
- The in-memory ZIP implementation uses the classic ZIP format and is intended for browser-sized export batches, not multi-gigabyte archival packaging.
- Batch 2.0 is a linear single-output PDF pipeline. Multi-output operations such as split are not recipe nodes in this phase.
- Batch 2.0 does not yet provide per-file password prompts for encrypted queue items.
- High-fidelity PDF ↔ DOCX/PPTX/XLSX and layout-faithful HTML/Markdown → PDF remain intentionally deferred rather than being represented by low-fidelity browser approximations.


## Phase 20 productization boundaries

- Adaptive large-document rendering bounds page-render concurrency and aggressively releases distant canvases, but source parsing and browser/WASM memory still impose practical document-size limits.
- The optional desktop-companion API is a typed bridge contract only. This source archive does not bundle a Tauri/native host, operating-system certificate integration, scanner driver, or default-PDF-handler registration.
- Workspace heartbeats can report an unclean previous session after crashes or force-closes. They do not imply that PDF source bytes were modified or corrupted.

## Phase 21 fail-safe operation boundaries

- Web Locks are used for cross-context document-operation serialization where the browser supports them. Without Web Locks, Phase 21 still relies on the existing project write-ownership lease plus an in-process operation coordinator; it does not claim a browser-independent distributed mutex.
- Browser storage estimates are advisory. The app reserves at least 25 MB or 5% of reported quota, whichever is larger, and blocks local writes that would consume that reserve when reliable quota data is available; the browser or operating system can still reject a later write.
- When `navigator.storage.estimate()` is unavailable, persistence proceeds as rollback-protected best effort and diagnostics report the uncertainty instead of inventing a capacity value.
- OCR keeps its existing resumable/page-aware pause behavior. Phase 21 does not expose a global instant-cancel control for recognition work that the underlying Tesseract call cannot safely interrupt at arbitrary points.
- Navigation guards apply while an operation is active in the open workspace. Forced browser termination can still interrupt in-memory work; Phase 16 transaction recovery and Phase 20 heartbeat evidence handle the next-open recovery path.



## Phase 22 GitHub Pages boundaries

- Standard GitHub Pages project sites such as `https://username.github.io/repository/` share one browser origin across repositories on that hostname. IndexedDB, Cache Storage, localStorage, OPFS, and BroadcastChannel are origin-scoped, not path-isolated. Phase 22 prevents accidental cross-application cache/service-worker cleanup, but a repository path cannot provide a security boundary against other scripts served from the same origin.
- For the strongest local-storage isolation while still using GitHub Pages, deploy this app on a dedicated custom hostname and set the repository variable `PAGES_BASE_PATH` to `/`.
- The source package deliberately does not contain a fabricated `package-lock.json`. The stable deployment workflow requires a real lock generated from the exact pinned dependencies.
- Offline reload is covered by the Phase 22 Playwright suite, but first use still requires one successful online load so the service worker can cache the built application assets. OCR language packs remain opt-in downloads/imports and are cached separately.

## Phase 23 mobile and tablet boundaries

- Touch and stylus input use browser Pointer Events. Pressure, tilt, barrel-button, and device-specific Pencil/S Pen brush dynamics are not guaranteed.
- The editor permits browser pinch zoom on the page background; a dedicated two-pointer document-zoom gesture is not yet implemented.
- iOS/iPadOS storage quotas, PWA persistence, file-picker capabilities, and background execution are browser/OS controlled and can differ from desktop Chromium.
- The phone UI intentionally turns dense sidebars into transient bottom sheets. Very large tables, preflight reports, and technical inspectors remain more efficient on a tablet or desktop-sized viewport.

## Phase 24 PWA and offline boundaries

- The production application bundle is fully precached after one successful online production load/install, but browser/OS storage eviction can still remove cached assets or local projects. Persistent storage reduces that risk; it is not a backup.
- OCR language packs remain explicit opt-in downloads/imports because they can be large. Offline OCR works only for packs already installed on that browser profile.
- Web Share Target, File Handling, Launch Handler, install prompts, and persistent-storage prompts are progressive web capabilities. Browsers and operating systems may ignore unsupported manifest members; the normal file picker and project restore workflows remain the compatibility baseline.
- The Share Target endpoint is handled by the scoped service worker and stores incoming files only in a temporary browser-local cache. Clearing site/cache data before import can remove that pending inbox.
- Phase 24 retains older release caches until the newly activated client reports a healthy boot. This reduces update-time version mixing but is not a general rollback system for arbitrary application logic bugs.
- Background execution remains browser controlled. Closing or suspending the PWA can stop OCR or other long-running work; Phase 16/20/21 recovery mechanisms remain the next-launch safety boundary.


## Phase 25 advanced-web boundaries

- Create PDF Studio's semantic HTML import preserves document structure such as headings, paragraphs, lists, quotes, code blocks, and rules. It does **not** claim layout-faithful reproduction of arbitrary CSS, JavaScript-driven pages, floating layouts, or web fonts.
- Searchable creator output supports the implemented Latin/CJK text paths. Shaping-dependent scripts are rejected from searchable mode rather than emitted incorrectly; Visual compatibility mode uses browser shaping but rasterizes the page, so PDF text is not searchable/selectable.
- Phase 25 introduced the block-layout creator. Phase 26 preserves common inline emphasis/code and safe links, but it still does not implement the entire CommonMark/HTML/CSS formatting model.
- Phase 26 Compare 3.0 adds low-resolution perceptual fingerprints for pages with little extractable text. Visually repetitive scans or near-identical forms can still require manual page-pair selection.
- Pixel comparison still compares rendered page appearance and can flag anti-aliasing/rendering differences as changes.
- Portable Batch recipe JSON contains processing settings only, not document bytes or passwords. Imported recipes are validated against the current supported step schema but future versions can still require migration.


## Phase 26 workflow-intelligence boundaries

- Compare 3.0 visual fingerprints are deliberately low resolution for browser performance. They improve scan alignment but are not image-forensics hashes and can confuse visually repetitive pages.
- Hybrid alignment still uses bounded dynamic programming, so extremely large page-count comparisons remain subject to browser CPU/memory limits.
- Create PDF Studio 2.0 preserves common inline bold/italic/bold-italic/code and safe `http`, `https`, and `mailto` links. Nested/edge-case Markdown grammar and arbitrary CSS remain outside the fidelity contract.
- Searchable creator links are interactive; Visual compatibility PDFs rasterize pages, so link appearance remains visible but link annotations are not preserved in that mode.
- Batch 3.0 multi-output operations must be the final recipe step. Split produces a ZIP of PDF parts; Page images produces a ZIP of PNGs. Later recipe steps cannot operate on multiple branches in this phase.
- Batch encrypted-file queues still do not provide per-file password prompts.


## Phase 27 release-qualification boundaries

- Phase 27 intentionally adds no PDF features. It freezes the functional scope while qualifying the real npm/build/browser/Pages release path.
- The source archive still does not contain a fabricated `package-lock.json`. Exact lock qualification can only pass after the GitHub bootstrap workflow resolves the pinned graph and its PR is merged.
- The local execution environment used to prepare this archive cannot reach the public npm graph reliably, so `npm ci`, official Vitest/Vite execution, and Playwright browsers are not claimed as locally passed. GitHub-hosted CI is the authoritative Phase 27 qualification environment.
- Same-commit reproducibility checks compare complete `dist` fingerprints after build timestamps were made deterministic. Reproducibility is asserted only when that CI comparison passes on the committed lockfile-derived graph.


## Phase 28 reliability-audit boundaries

- Phase 28 intentionally adds no end-user PDF features. It is a failure-injection, recovery, persistence, backup-integrity, and adversarial-input audit.
- Version 9 `.lpsproject` files authenticate both payload bytes and canonical header metadata. Legacy v1–v8 packages remain importable, but they retain the integrity guarantees of the version that created them; Phase 28 cannot retroactively authenticate an old unsigned header.
- The 56-file adversarial corpus is broad but finite. PDF is a very large format, so undocumented producer-specific edge cases can still exist; unsupported or malformed inputs must fail safely rather than be silently repaired.
- Visual regression in the dependency-independent Phase 28 corpus is a deterministic render smoke check, not cross-browser pixel equivalence. The real Playwright/browser matrix remains mandatory once the exact npm lockfile is available.
- Browser/OS storage can still fail between a quota estimate and the actual write. Phase 21/28 guard this with preflight, transaction abort handling, cleanup, and immutable derived revisions, but `.lpsproject` backups remain necessary for important work.


## Phase 30 release-freeze boundaries

- The repository feature set remains frozen; this maintenance source is version `6.0.6`, but a source checkout is **not automatically a stable build**. Without `VITE_RELEASE_CHANNEL=stable`, the application identifies itself as release-candidate.
- Stable promotion is intentionally restricted to the exact `v6.0.6` GitHub tag workflow after the committed lockfile, deterministic clean build, full browser/device matrix, adversarial corpora, security/privacy audits, and deployed Pages smoke test pass.
- Project-package formats v1–v8 remain importable for backward compatibility, but only v9 authenticates both payload bytes and canonical header metadata. Older backups therefore retain their historical integrity guarantees rather than being upgraded retroactively.
- Browser/platform limitations documented in earlier phases remain product boundaries; Phase 30 does not add native desktop APIs, server-side conversion, certified PDF/A/PDF-UA validation, or certificate-backed PAdES signing.
