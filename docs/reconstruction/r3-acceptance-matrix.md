# R3 Acceptance Matrix

Status meanings:

- **PASS** — source-backed invariant implemented on the R3 branch.
- **PENDING** — requires CI/browser execution on the final PR head.
- **UNMEASURED** — requires real-user/manual evidence and is not inferred from source.

| Area | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| Scope | R3 adds no new PDF processing engine | PASS | Changes are confined to interaction/view/docs/regression surfaces. |
| Scope | Database/project/package schemas remain unchanged | PASS | No schema source is modified. |
| Architecture | Read/Edit/Pages/Tools remain the primary document destinations | PASS | R3 does not alter R2 primary mode definitions. |
| Read | Page navigation remains directly available | PASS | Viewer retains previous/current/next controls. |
| Read | Zoom remains directly available | PASS | Viewer retains zoom out/select/in. |
| Read | Single/continuous view remains directly available | PASS | Viewer retains both view modes. |
| Read | Project backup is secondary, not primary reader chrome | PASS | Backup is under the Document disclosure. |
| Read | Original-PDF download is secondary, not primary reader chrome | PASS | Download original PDF is under Document. |
| Read | Advanced search options are collapsed by default | PASS | Search options use `details`. |
| Read | Technical metadata is collapsed by default | PASS | Technical information uses `details`. |
| Read | Internal large-document scheduling profile is not normal reader chrome | PASS | Performance badge is no longer rendered and is suppressed by R3 disclosure CSS. |
| Edit | Implementation phase selection badge is not visible | PASS | `.p6-selection-count` is suppressed in the R3 interaction layer. |
| Edit | Queued native-edit counter is not persistent chrome | PASS | `.native-queued-count` is suppressed. |
| Edit | Layer confidence percentages are not default list content | PASS | Layer secondary technical text is suppressed; detailed capability evidence remains in property-panel disclosures. |
| Edit | Native property technical confidence remains available on demand | PASS | Existing capability panels retain `Technical details`. |
| Edit | Original-PDF preservation is prominent | PASS | Edit document identity presents “Original PDF stays unchanged.” |
| Edit | Existing selection-dependent property panels remain functional | PASS | R3 does not replace editor selection/property dispatch. |
| Edit | Existing keyboard editing shortcuts remain intact | PASS | Editor keyboard handling is unchanged. |
| Pages | Page commands are selection-first | PASS | Rotate/duplicate/delete/extract/reverse-selection live in the selection action surface. |
| Pages | Undo and redo remain persistent | PASS | Page toolbar retains history actions. |
| Pages | Download output uses copy semantics | PASS | Primary label is `Download copy`. |
| Pages | Browser-local output uses new-project semantics | PASS | Primary label is `Save new project`. |
| Pages | No-selection state teaches the next action | PASS | Empty selection action surface tells user to select pages. |
| Pages | Preservation explanation is progressive disclosure | PASS | `What happens when I create an output?` details replaces permanent warning. |
| Pages | Source PDF is explicitly not overwritten | PASS | Header/output explanation states original is unchanged. |
| Pages | Export output still reopens/validates page count | PASS | Existing `inspectPdfBytes` validation remains in `exportPlan`. |
| Tools | Utility task route preserves task ID | PASS | Document utility links include `taskId`. |
| Tools | Focused utility does not require rediscovery | PASS | Focused DocumentTools renders Toolbox with `initialTaskId`. |
| Tools | Crop launches crop controls | PASS | `crop-pages` maps to Pages tab with blank controls hidden. |
| Tools | Blank-page task launches blank-page controls | PASS | `insert-blank-pages` maps to Pages tab with crop controls hidden. |
| Tools | Metadata launches metadata controls | PASS | `metadata` maps directly to Metadata. |
| Tools | Split launches split controls | PASS | `split-pdf` maps to focused Convert surface. |
| Tools | Grayscale launches grayscale controls and loss warning | PASS | `grayscale-pdf` maps directly to grayscale action with explicit flatten boundary. |
| Tools | Export-content task launches export controls | PASS | `export-content` maps directly to content exports. |
| Tools | PDF-changing utility output opens in Read | PASS | Derived utility projects navigate to viewer. |
| Tools | Content-only exports do not replace current project | PASS | Export functions download artifacts only. |
| Shared | Long operations retain cancellation where supported | PASS | Organizer/Toolbox abort controllers and operation coordinator cancellation remain. |
| Shared | Errors remain in workflow context | PASS | R3 surfaces errors in Viewer/Pages/Tools rather than redirecting away. |
| Shared | R3 interaction CSS is part of production entry | PASS | `main.tsx` imports `interaction/r3.css`. |
| Responsive | Page action layout stacks at constrained widths | PASS | R3 responsive rules cover 980px and 680px. |
| Responsive | Secondary Read document administration does not crowd phone toolbar | PASS | Narrow viewport hides viewer document actions. |
| Qualification | TypeScript typecheck on final head | PENDING | GitHub CI. |
| Qualification | Production build on final head | PENDING | GitHub CI. |
| Qualification | Consumer performance budget on final head | PENDING | GitHub Actions. |
| Qualification | Historical non-browser release gates | PENDING | PDF Studio CI. |
| Qualification | Verified-distribution browser/privacy suite | PENDING | PDF Studio CI. |
| UX metric | ≥90% first-location accuracy for top-20 tasks | UNMEASURED | Requires R8/manual user study evidence. |
| UX metric | ≥90% top-10 workflows without Help | UNMEASURED | Requires R8/manual user study evidence. |

## R3 acceptance rule

R3 may be merged only after the final PR head passes repository CI. Source-backed PASS rows do not substitute for browser qualification, and UNMEASURED rows must not be promoted to PASS without real evidence.