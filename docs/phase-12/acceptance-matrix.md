# Phase 12 Acceptance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| One document workspace route | Passed | `workspace/:projectId/:mode` router and runtime tests |
| Legacy document route compatibility | Passed | Legacy routes parsed; generated links use workspace route |
| Persistent open tabs | Passed | `workspaceSessions` IndexedDB store |
| Pin, close, restore, reorder | Passed | Workspace repository and UI controls |
| Last mode per tab | Passed | `WorkspaceTab.lastMode` |
| Simple and Advanced modes | Passed | Settings schema 4 and mode filtering |
| Contextual actions | Passed | Project-summary action suggestions |
| Preservation contracts | Passed | Contract registry and side panel |
| Unified project history | Passed with boundary | Workspace events plus existing mode histories; Phase 13 will unify engine-level commands |
| Restorable checkpoints | Passed | Full project-package snapshots in IndexedDB |
| Project deletion cleanup | Passed | Workspace events, checkpoints, and session records removed |
| Maintenance orphan detection | Passed | Workspace stores included in storage health checks |
| Mobile adaptation | Implemented; browser test pending | Responsive tabs, mode rail, and slide-over panel CSS |
| No duplicate navigation walls | Passed | Project cards and embedded viewer links simplified |
| No PDF reopening across every switch | Partial | Project state is unified; mode engines initialize lazily and remain architecture work for Phase 13 |
| Official browser regression | Pending | Requires npm lockfile and Playwright matrix |
