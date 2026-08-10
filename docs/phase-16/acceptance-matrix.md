# Phase 16 acceptance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Checkpoint restore cannot overwrite source project state | Pass | Package restore defaults to `deduplicate: false`; checkpoint path forces independent identity |
| Raw PDF deduplication retained | Pass | `createProjectFromBytes` remains deduplicating by default |
| Repeated package/checkpoint imports do not share editor assets | Pass | Asset IDs are regenerated and image-object references remapped per import |
| Failed derived commit cannot leave a partial output project | Pass | Derived creation cleans up before recording rollback |
| Interrupted transaction can be reconciled after ownership recovery | Pass | `reconcileInterruptedTransactions` links an already-created output or records rollback |
| Write lock spans all mutating workspace modes | Pass | Lease lives in `UnifiedWorkspace`; mutating modes render a write-protected surface for duplicate tabs |
| Read-only Viewer avoids project persistence writes | Pass | Viewer preference saves and project-touch writes are suppressed without ownership |
| Standards-based browser lock where available | Pass | Web Locks API with localStorage/BroadcastChannel fallback |
| Derived output has parent lineage | Pass | Project manifest revision + lineage metadata |
| Transformation is journaled | Pass | `documentTransactions` with preparing/committed/rolled-back states |
| Preservation detects same-count replacement | Pass | Graph v2 semantic fingerprints + unit regression |
| XMP/layer/image-resource changes participate in preservation | Pass | Graph v2 includes XMP stream, layer state/name, and image XObject semantic fingerprints |
| OCR preprocessing change invalidates resume cache | Pass | Deterministic recipe fingerprint + unit regression |
| Unequal PDF page counts compare correctly | Pass | Missing side is empty/blank, never clamped + unit regression |
| Offline Phase 11 corpus | Pass | Existing 11-file dual-reader corpus |
| Full Vite build | Pending environment gate | Requires installed dependencies |
| Vitest full suite | Pending environment gate | Requires installed dependencies |
| Phase 16 checkpoint + ownership E2E scenarios | Added, execution pending | `tests/e2e/phase16.spec.ts` |
| Chromium/Firefox/WebKit E2E | Pending environment gate | Configured npm mirror lacks `@playwright/test@1.62.0`; public registry timed out |
