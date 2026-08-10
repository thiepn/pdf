# Phase 18 acceptance matrix

| Requirement | Status | Evidence / boundary |
|---|---|---|
| Toolbox integrated into unified workspace | Pass | Workspace mode, router, command palette, tools catalogue, preservation contract |
| Source project never overwritten by Toolbox transform | Pass | `createDerivedProjectFromBytes` transaction path |
| Watermark/header/footer/page numbers | Pass | `toolbox.worker.ts`; footer/page number use separate alignment when combined |
| Latin + CJK static decoration | Pass | Latin simple font; `ko`, `ja`, `zh-Hans`, `zh-Hant` CID-font path |
| Complex-script corruption avoided | Pass | Static writer rejects shaping-dependent scripts |
| Crop in millimetres | Pass | UI mm → internal PDF points; CropBox only |
| Crop securely deletes hidden content | Not claimed | CropBox does not erase content |
| Blank-page insertion | Pass | Start/end, bounded count, custom mm dimensions |
| Metadata edit/remove | Pass | Info update and Info/XMP removal |
| Encrypted Toolbox session support | Pass | Password propagated in memory to worker/export/reopen validation |
| PDF → TXT | Pass | Local PDF.js extraction |
| PDF → Markdown | Pass | Page-separated content export; not layout faithful |
| PDF → HTML | Pass | Standalone escaped content export; not layout faithful |
| PDF → page images | Pass | Local page rendering into PNG ZIP |
| Fixed-page split | Pass | Page-plan compiler + ZIP packaging |
| Grayscale PDF | Pass | Raster derived revision with structure-loss warning |
| Batch ordered recipe nodes | Pass | Schema 2 typed step pipeline |
| Batch pause/resume recipe isolation | Pass | Active recipe is snapshotted and locked until the paused run is resumed or ended |
| Batch multi-output download | Pass | Completed outputs can be packaged into one collision-safe local ZIP |
| Legacy batch migration | Pass | Deterministic v1→v2 model + regression |
| Dependency-independent runtime regression | Pass | Phase 18 23-check runtime suite |
| Vitest unit suite | Pending real dependency install | Matching Phase 18 unit sources are included; official pinned npm graph is unavailable in this environment |
| Full pinned Vite/Vitest/Playwright matrix | Pending | Requires official npm dependency install/lock |
| PDF ↔ high-fidelity Office | Deferred | No fidelity-safe browser engine in this phase |
| Layout-faithful HTML/Markdown → PDF | Deferred | Not replaced with browser-print/raster approximation |
