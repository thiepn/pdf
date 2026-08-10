# Phase 24 — PWA & Offline Excellence

## Goal

Make Local PDF Studio behave as a deliberate installable/offline web application while preserving its static GitHub Pages, browser-local architecture.

## Product constraints

- No backend.
- No required desktop runtime.
- GitHub Pages repository subpaths remain supported.
- Normal browser file pickers remain the compatibility baseline.
- Optional installed-PWA APIs must be capability detected and never required.
- OCR language data remains explicit opt-in storage.

## Workstreams

### 1. Complete offline release cache

Every production build emits `offline-assets.json`, listing all runtime files required by the release except source maps and release evidence generated after the build. The scoped service worker precaches the release shell, compiled chunks, workers/WASM, Tesseract runtime, icons, ICC profile, and public runtime assets.

### 2. Atomic service-worker update handoff

A newly installed worker creates its own versioned release cache. Activation does not immediately delete previous release caches. The old release is pruned only when a newly loaded client reports a healthy boot. Older workers must not delete a newer waiting release cache.

Document operations from Phase 21 block update activation/reload until the operation is complete or cancelled.

### 3. Install and persistence readiness

Home and Settings expose a readiness surface showing:

- installed/standalone state;
- production offline cache completeness;
- persistent-storage state;
- installed OCR language pack count;
- install prompt/manual installation guidance.

Persistent storage remains user initiated and is not represented as a backup.

### 4. Installed-PWA file ingress

The manifest declares progressive File Handling, Launch Handler, and Web Share Target capabilities for `.pdf` and `.lpsproject` files.

Share Target POSTs are intercepted by the scoped service worker and staged in a deployment-namespaced browser Cache Storage inbox. Home imports the pending file locally. No upload endpoint is introduced.

### 5. Offline OCR clarity

Installed/imported language packs remain available offline. Network installation controls disable when disconnected and explain that offline packs must already exist locally.

### 6. Validation

Phase 24 adds:

- source/readiness audits for offline asset generation and atomic cache handoff;
- a dependency-independent Phase 24 regression suite;
- unit tests for file ingress classification;
- Playwright checks for complete service-worker cache readiness and network-disabled application-shell reload.
