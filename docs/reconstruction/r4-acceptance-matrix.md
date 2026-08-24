# R4 Acceptance Matrix

Status vocabulary:

- **PASS** — implemented in source and/or qualified by a deterministic test listed below.
- **CI** — requires the final exact-head repository gate before merge.

| ID | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| R4-01 | Runtime support uses the exact R0 state vocabulary. | `src/capabilities/taskCapability.ts` | PASS |
| R4-02 | Capability classification is separate from R1 feature classification. | R0 policy + R4 resolver | PASS |
| R4-03 | One canonical resolver owns task support decisions. | `evaluateTaskCapability` | PASS |
| R4-04 | Global Tools surfaces generic capability boundaries before file selection. | `src/views/ToolsPage.tsx` | PASS |
| R4-05 | Current-document Tools evaluates project-specific capability. | `src/views/DocumentToolsPage.tsx` | PASS |
| R4-06 | Unsupported current-document task cards are disabled. | `DocumentTask` | PASS |
| R4-07 | Temporarily unavailable task cards are disabled. | `isCapabilityBlocked` | PASS |
| R4-08 | Hidden tasks are not rendered by capability-aware task surfaces. | `ToolsPage`, `DocumentToolsPage` | PASS |
| R4-09 | Warnings are visible before execution. | `TaskCapabilityChip`, `TaskCapabilityNotice` | PASS |
| R4-10 | Experimental status is explicit. | archive-readiness rule + UI chip | PASS |
| R4-11 | Task-specific workspace routes are guarded before implementation mount. | `CapabilityGatedWorkspace`, `App.tsx` | PASS |
| R4-12 | Mismatched task/mode URLs fail closed. | `CapabilityGatedWorkspace` | PASS |
| R4-13 | Project-context construction failure fails closed. | `CapabilityGatedWorkspace` | PASS |
| R4-14 | Legacy taskless workspace routes remain compatible. | `CapabilityGatedWorkspace` no-task path | PASS |
| R4-15 | Ctrl/Cmd+K current-document task routes retain task ID and hit the same guard. | task catalog routing + R4 E2E | PASS |
| R4-16 | Fill forms is blocked when the manifest reports zero form widgets. | resolver + unit/E2E | PASS |
| R4-17 | Fill forms deep-inspects widget mutability before Protect mounts. | `buildTaskCapabilityContext` + guard | PASS |
| R4-18 | Read-only/signature/button-only forms are blocked as non-fillable. | resolver + unit | PASS |
| R4-19 | Writable supported form fields keep Fill forms available. | resolver + unit/E2E | PASS |
| R4-20 | Fill-form blocker offers Edit as a safe alternative. | resolver + blocker component | PASS |
| R4-21 | Split is blocked for one-page PDFs. | resolver + unit/E2E | PASS |
| R4-22 | Multi-page split remains available with material warning. | resolver + unit | PASS |
| R4-23 | Permanent redaction checks saved editor marks. | `buildTaskCapabilityContext` | PASS |
| R4-24 | Permanent redaction performs deep source-annotation inspection only at task entry. | guard options + resolver | PASS |
| R4-25 | Conclusive absence of all redaction marks blocks the task. | resolver + unit/E2E | PASS |
| R4-26 | Inconclusive protected-source inspection does not create a false unsupported result. | resolver + unit | PASS |
| R4-27 | Redaction blocker routes to marking redactions. | resolver alternative + blocker | PASS |
| R4-28 | Flatten deep-inspects supported forms/annotations before Protect mounts. | guard + security evidence | PASS |
| R4-29 | Flatten is blocked when there is nothing supported to flatten. | resolver + unit | PASS |
| R4-30 | Flatten remains warning-enabled when supported content exists. | resolver + unit | PASS |
| R4-31 | OCR is unavailable when Worker support is absent. | resolver + unit | PASS |
| R4-32 | OCR is unavailable when WebAssembly support is absent. | resolver + unit | PASS |
| R4-33 | Protect/security tasks are unavailable when required Worker/WebAssembly support is absent. | resolver + unit | PASS |
| R4-34 | OCR reconstruction limitation appears before execution. | resolver | PASS |
| R4-35 | Visual signature is explicitly non-cryptographic. | resolver + E2E | PASS |
| R4-36 | Permanent-redaction consequences are explicit before document selection. | resolver + unit | PASS |
| R4-37 | Redaction marks are explicitly non-permanent until applied. | resolver | PASS |
| R4-38 | CropBox cropping is explicitly not secure erasure. | resolver + unit | PASS |
| R4-39 | Grayscale rasterization/loss boundary is explicit. | resolver + unit | PASS |
| R4-40 | Flattening loss of interactivity/editability is explicit. | resolver + unit | PASS |
| R4-41 | Sanitization removal semantics are explicit. | resolver | PASS |
| R4-42 | Accessibility does not claim arbitrary PDF/UA certification. | resolver + unit | PASS |
| R4-43 | Archive readiness is experimental and does not claim certified PDF/A. | resolver + unit/E2E | PASS |
| R4-44 | Print-layout prepress boundary is explicit. | resolver | PASS |
| R4-45 | Repair finite-recovery boundary is explicit. | resolver | PASS |
| R4-46 | Existing post-processing validators remain unchanged. | R4 diff scope | PASS |
| R4-47 | Existing PDF processing algorithms and worker protocols are unchanged. | R4 diff scope | PASS |
| R4-48 | No database/project/package/editor schema migration is introduced. | R4 diff scope | PASS |
| R4-49 | Historical smoke flow no longer treats a form-less sample as form-capable. | `tests/e2e/smoke.spec.ts` | PASS |
| R4-50 | Direct task URL cannot bypass fill-form preflight. | `tests/e2e/r4-capability-gating.spec.ts` | PASS |
| R4-51 | Ctrl/Cmd+K cannot bypass fill-form preflight. | `tests/e2e/r4-capability-gating.spec.ts` | PASS |
| R4-52 | Deep redaction preflight blocks a no-redaction fixture. | `tests/e2e/r4-capability-gating.spec.ts` | PASS |
| R4-53 | One-page and form fixtures provide representative negative/positive controls. | Phase 11 generated corpus | PASS |
| R4-54 | Unit capability suite passes on exact branch head. | repository CI | CI |
| R4-55 | TypeScript and production build pass on exact branch head. | repository CI | CI |
| R4-56 | Historical non-browser release qualification passes. | repository CI | CI |
| R4-57 | Reproducible build and dependency-security gates pass. | repository CI | CI |
| R4-58 | Consumer performance budget passes. | repository CI | CI |
| R4-59 | Verified-distribution browser/privacy matrix passes. | repository CI | CI |

## Merge rule

R4 must not merge until every `CI` row above passes on the exact PR head. A source-backed PASS is not a substitute for the final repository/browser gate.

## Next phase after R4

**R5 — Desktop Visual/UI Reconstruction**. R5 should rebuild visual hierarchy, density, typography, control grouping, empty/loading/error states, and interaction polish around the now-stable Read/Edit/Pages/Tools architecture without reintroducing subsystem clutter.
