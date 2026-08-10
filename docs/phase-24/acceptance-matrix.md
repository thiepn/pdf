# Phase 24 Acceptance Matrix

| Requirement | Evidence | Status |
|---|---|---|
| Production build emits a complete offline asset manifest | `scripts/generate-offline-assets.mjs` | PASS |
| Offline manifest is validated before release | `scripts/check-dist.mjs` | PASS |
| Source maps excluded from runtime precache | offline generator | PASS |
| Service worker precaches generated runtime assets | `public/sw.js` | PASS |
| Offline readiness reports expected/cached counts | `GET_OFFLINE_STATUS` | PASS |
| Previous release cache survives until healthy boot | `CLIENT_HEALTHY` handoff | PASS |
| Older worker cannot delete newer waiting release | semantic-version cache comparison | PASS |
| Updates defer while document work is active | service-worker manager + Phase 21 coordinator | PASS |
| PWA installation/manual guidance exists | `installManager.ts`, `PwaReadinessCard.tsx` | PASS |
| Persistent-storage request remains explicit | readiness card / Storage page | PASS |
| OCR offline behavior is explicit | `OcrLanguagePanel.tsx` | PASS |
| Web Share Target is local-only | manifest + scoped SW share inbox | PASS |
| File Handling/Launch Handler are progressive | manifest + `launchFiles.ts` | PASS |
| Normal file picker remains available | Home | PASS |
| GitHub Pages repository scope remains intact | Phase 22 readiness audit | PASS |
| Dependency-independent Phase 24 regression | 12/12 | PASS |
| Full Phase 16–24 runtime chain | all phase scripts | PASS |
| External-reader corpus | 11/11 | PASS |
| Official lockfile-derived browser/build gate | GitHub CI | PENDING ENVIRONMENT |
