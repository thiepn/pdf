# R2 — Acceptance Matrix

Status values are evidence-based. CI-dependent rows remain pending until the pull-request workflows complete.

| # | Requirement | Evidence | Status |
| ---: | --- | --- | --- |
| 1 | R2 starts from merged R1 main | Branch created from `main` after PR #15 merge | PASS |
| 2 | No PDF processing engine redesign | R2 diff is IA/UI/help/regression documentation only | PASS |
| 3 | Canonical runtime task catalog exists | `src/ia/taskCatalog.ts` | PASS |
| 4 | Tasks use user-outcome labels | Create/Edit/Pages/Protect/Convert/Review/Automate taxonomy | PASS |
| 5 | Task definitions include synonyms/search text | `keywords` + `taskSearchText()` | PASS |
| 6 | Tasks define one canonical destination | `PdfTask.target` | PASS |
| 7 | Everyday/advanced/recovery audience tier exists | `TaskAudience` | PASS |
| 8 | Recovery tasks hidden from default browse | Tools filters `audience !== recovery` | PASS |
| 9 | Recovery tasks remain searchable | Query path includes all matching tasks | PASS |
| 10 | Global Tools uses canonical catalog | `ToolsPage.tsx` | PASS |
| 11 | Current-document Tools uses canonical catalog | `DocumentToolsPage.tsx` | PASS |
| 12 | Command palette uses canonical catalog | `CommandPalette.tsx` | PASS |
| 13 | Command palette no longer maintains a workspace-mode list | `workspaceModes` removed | PASS |
| 14 | Search supports crop intent | `crop-pages` keywords | PASS |
| 15 | Search supports metadata removal intent | `metadata` keywords | PASS |
| 16 | Search supports signing intent | `visual-signature` keywords | PASS |
| 17 | Visual signature is not misrepresented as digital certificate signing | Explicit task/help distinction | PASS |
| 18 | Search supports split intent | `split-pdf` keywords | PASS |
| 19 | Search supports OCR intent | `ocr-pdf` task | PASS |
| 20 | Search supports booklet/imposition intent | `print-layout` keywords | PASS |
| 21 | Search supports Bates intent | `bates-numbering` task | PASS |
| 22 | Global Tools preserves selected intent before file selection | task-aware `#/tools/<taskId>` route | PASS |
| 23 | Document workspace has exactly four primary destinations | Read / Edit / Pages / Tools | PASS |
| 24 | Desktop no longer shows seven/nine peer workspace modes | `UnifiedWorkspace.tsx` primary nav | PASS |
| 25 | Separate technical diagnostics mode strip removed | `technicalModes` and strip removed | PASS |
| 26 | Simple/Advanced workspace switch removed | segmented control and setter removed | PASS |
| 27 | Simple/Advanced Settings selector removed | `SettingsPage.tsx` | PASS |
| 28 | Persisted experience field retained for compatibility | settings schema unchanged | PASS |
| 29 | Specialist modes remain deep-link compatible | ModeContent still handles existing WorkspaceMode values | PASS |
| 30 | Specialist modes map back to Tools in primary nav | non-primary active mode resolves to toolbox | PASS |
| 31 | Mobile uses same Read/Edit/Pages/Tools model | mobile primary nav | PASS |
| 32 | Mobile More no longer exposes a second mode taxonomy | actions only | PASS |
| 33 | Inspector is no longer suggested automatically | removed no-outline Inspect context action | PASS |
| 34 | Useful contextual suggestions remain | forms, protection, large page count, large file | PASS |
| 35 | Toolbox is no longer a user-facing product mental model | Document utilities disclosure wraps existing implementation | PASS |
| 36 | Toolbox implementation remains available | `ToolboxPage` retained inside disclosure | PASS |
| 37 | Forms/security capabilities are discoverable by intent | Fill forms / redaction / sanitize / protect / flatten tasks | PASS |
| 38 | OCR is discoverable without being a primary navigation tab | task catalog + Tools | PASS |
| 39 | Compression is discoverable without being a primary navigation tab | Compress PDF task | PASS |
| 40 | Accessibility is an advanced task, not a peer nav mode | catalog + specialist route | PASS |
| 41 | Print/Bates/archive are advanced tasks, not a generic Print & Advanced destination | catalog terminology | PASS |
| 42 | Repair is recovery-only discovery | task audience `recovery` | PASS |
| 43 | Document details are recovery-only discovery | task audience `recovery` | PASS |
| 44 | History prioritizes checkpoints | checkpoint section remains primary | PASS |
| 45 | Revision/transaction/event jargon is progressively disclosed | Technical history details | PASS |
| 46 | Help teaches four-destination architecture | `helpContent.ts` workspace article | PASS |
| 47 | Help teaches task search | `find-task` article | PASS |
| 48 | Help no longer instructs users to enable Advanced mode | rewritten Help content | PASS |
| 49 | Historical intuitiveness regression tests the R2 principles | updated v6.1 runtime regression | PASS |
| 50 | TypeScript compiles | PR CI | PENDING |
| 51 | Source/release audit passes | PR CI | PENDING |
| 52 | Reproducible build gate passes | PR CI | PENDING |
| 53 | Consumer performance budget passes | PR CI | PENDING |
| 54 | Browser regression against verified distribution passes | PR CI | PENDING |
| 55 | No project/database schema regression | PR CI + no schema diff | PENDING |

## Merge rule

R2 is not complete until all CI-dependent rows are green on the final PR head. A mergeable GitHub state alone is not sufficient.
