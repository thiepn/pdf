# R1 Acceptance Matrix — Feature Inventory & Ruthless Simplification

R1 is complete only when the product surface has been inventoried, simplification decisions are explicit, and the immediate low-risk removals do not break the application.

| ID | Requirement | Evidence | Status |
|---|---|---|---|
| R1-01 | Audit actual source rather than README claims | `r1-feature-inventory.md` source-surface list | PASS |
| R1-02 | Inventory capabilities at user-intent level | `feature-registry.csv` | PASS |
| R1-03 | Inventory covers global/project surfaces | G-series registry rows | PASS |
| R1-04 | Inventory covers viewer | V-series registry rows | PASS |
| R1-05 | Inventory covers unified editor | E-series registry rows | PASS |
| R1-06 | Inventory covers page operations | P-series registry rows | PASS |
| R1-07 | Inventory covers optimization | O-series registry rows | PASS |
| R1-08 | Inventory covers OCR/create/scan/conversion | C-series registry rows | PASS |
| R1-09 | Inventory covers Toolbox capabilities | T-series registry rows | PASS |
| R1-10 | Inventory covers forms/security/redaction/protection | S-series registry rows | PASS |
| R1-11 | Inventory covers compare/batch | A-series registry rows | PASS |
| R1-12 | Inventory covers professional/print | PR-series registry rows | PASS |
| R1-13 | Inventory covers standards/accessibility | AC-series registry rows | PASS |
| R1-14 | Inventory covers inspect/repair/preservation | D-series registry rows | PASS |
| R1-15 | Inventory covers information-architecture containers | IA-series registry rows | PASS |
| R1-16 | Every row has R0 A-H classification | Registry schema and rows | PASS |
| R1-17 | Every row has support state | Registry schema and rows | PASS |
| R1-18 | Every row has Keep/Repair/Merge/Demote/Hide/Remove action | Registry schema and rows | PASS |
| R1-19 | Duplicate workflows identified | `r1-duplicate-map.md` | PASS |
| R1-20 | Canonical-action rule defined for duplicates | duplicate map + registry | PASS |
| R1-21 | Obsolete v7 duplicate editing paths identified | PR001/PR002 | PASS |
| R1-22 | Standalone Preservation judged against overlapping capabilities | D004-D007 | PASS |
| R1-23 | Form-authoring capability contradiction recorded | S002 + inventory report | PASS |
| R1-24 | Visual vs digital signature boundary frozen | E009/S015/S016/AC005 | PASS |
| R1-25 | Command-palette architecture defect recorded | G018/IA + inventory | PASS |
| R1-26 | Workspace mode-rail defect recorded | IA002 | PASS |
| R1-27 | Internal editor terminology identified for removal/hiding | E021-E023 | PASS |
| R1-28 | Feature-expansion freeze preserved | R0 constitution + R1 decisions | PASS |
| R1-29 | Duplicate PWA readiness removed from Home | `HomePage.tsx` | PASS |
| R1-30 | Engineering-foundation cards removed from Home | `HomePage.tsx` | PASS |
| R1-31 | Home now prioritizes opening/resuming/tasks | `HomePage.tsx` | PASS |
| R1-32 | Diagnostics removed from ordinary Support sidebar | `AppShell.tsx` | PASS |
| R1-33 | App self-check removed from ordinary Support sidebar | `AppShell.tsx` | PASS |
| R1-34 | Raw local-storage diagnostic page removed from ordinary Support sidebar | `AppShell.tsx` | PASS |
| R1-35 | Technical routes remain accessible for support/compatibility | Help/About routes unchanged | PASS |
| R1-36 | Inspect/Repair/Preservation removed from ordinary command search | `CommandPalette.tsx` | PASS |
| R1-37 | Inspect/Repair tiles removed from normal PDF Tools page | `ToolsPage.tsx` | PASS |
| R1-38 | No PDF processing engine deleted in R1 | source changes limited to exposure/copy/docs | PASS |
| R1-39 | Existing project/schema formats unchanged | no schema changes | PASS |
| R1-40 | TypeScript/build/test regression suite passes | GitHub CI on R1 PR | PENDING |
| R1-41 | R1 changes remain compatible with R0 product constitution | review against R0 docs | PASS |
| R1-42 | R2 handoff is explicit | `r1-feature-inventory.md` | PASS |

## R1 release gate

R1 may merge when:

1. R1-01 through R1-39 and R1-41 through R1-42 remain PASS;
2. repository CI satisfies R1-40;
3. review finds no capability accidentally deleted rather than merely hidden/demoted;
4. branch remains based on the merged R0 `main` baseline.

## Deferred by design

The following are **not R1 failures** because they belong to later reconstruction phases:

- full new task-oriented navigation — R2;
- action-based command palette — R2;
- rewriting all editor implementation terminology — R2/R3;
- golden-workflow interaction reconstruction — R3;
- universal capability-state enforcement and late-error elimination — R4;
- desktop visual redesign — R5;
- phone/tablet redesign — R6;
- full guidance/error/trust rewrite — R7;
- representative real-world certification — R8.
