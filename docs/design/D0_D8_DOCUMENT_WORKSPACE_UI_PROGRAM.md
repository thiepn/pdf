# PDF Studio — Document Workspace UI Program (D0–D8)

Status: **D0 audit complete; D1 implementation under test.** These are visual/interaction stages, not PDF-engine qualifications.

## Product brief
A browser-local PDF tool whose value starts with an actual document. The interface should feel like a professional editor/utility, not a SaaS marketing homepage. Prioritize page content, task completion, source fidelity, explicit output, and recoverability. Retain existing PDF engines, privacy model, accessibility semantics, persisted projects, capability gates, and output validation.

User preferences: no generic gigantic motivational headings, no decorative gradient headers, no repeated dashboard cards or indiscriminate rounded boxes. Use a compact typographic scale, precise alignment, useful density, subtle separators, and a distinctive paper-and-graphite document workspace with a restrained action accent.

## Audited starting point (from source)
- `HomePage.tsx` led with a prominent "Less work. More done." heading and a centered landing-hero area, placing actual work below introductory material.
- Default tool cards in `foundation.css` were 186px tall with 15px radii, shadows, and top/bottom padding; this uses considerable space for small operations.
- Home, editor, workspace, and responsive appearance have accumulated several CSS layers. The program must scope new rules by surface and consolidate ownership gradually.
- Browser behavior and keyboard routes already exist; styling must not remove file-first actions, real tool selection, mobile overflow, or fidelity checks.

## Visual principles
1. **Document first.** A filename, document thumbnail, canvas, file drop area, or task is the primary visible element.
2. **Quiet chrome.** Headers and controls must not compete with PDF pages. No large SaaS hero banners.
3. **Useful density.** Most frequent PDF tasks visible without navigating through category dashboards.
4. **Distinct surfaces.** Home is a file launcher, Editor is an editing studio, quick tools are task workbenches, result is a verified receipt. Do not render all as the same cards.
5. **Information over ornament.** Use explicit status labels, compact action groups, real previews, visible progress, simple boundaries, and no fictitious analytics.
6. **Accessibility and correctness.** Existing labels, roles, error messages, focus behavior, touch targets, reduced-motion, and forced-colors remain. Preserve truthful local/private claims.
7. **Progressive rollout.** Every phase has a scoped CSS/TSX ownership boundary and actual automated regression checks. Keep production separate until approved.

## Phase plan and acceptance

| Phase | Change | Completion criteria |
|---|---|---|
| D0 | Source audit, visual contract, breakpoints, release guardrails | This document; source-backed problems; phased acceptance |
| D1 | File-first Home; dense task launch; visible recents; neutral typography | Desktop and mobile home tests; upload-to-task route; visible keyboard controls; screenshot review |
| D2 | Search-first Tool Directory, tool grouping and clear capability states | Searching, empty state, disabled-state rationale; no dead links |
| D3 | Editor shell: restrained command bar, canvas proportions, meaningful action order | Existing-source editing, save-as, undo/redo, preview statuses remain visible |
| D4 | Object inspector, thumbnail strip, layers/comments and contextual states | Selection, multi-select, disabled state, keyboard-only navigation |
| D5 | Quick-tool workflow: file inventory, options, result/export receipt | Clear start/preview/process/result without losing input or claiming false fidelity |
| D6 | Dedicated phone/tablet and landscape layouts, touch targets, safe areas | Physical-device layout checklist plus emulated regression; no clipped canvas controls |
| D7 | Typography, icons, motion, dark mode, accessibility/contrast and keyboard polish | WCAG-oriented checks, high contrast, forced colors, reduced motion |
| D8 | Cross-browser visual QA, performance budgets, high-resolution screenshots, controlled integration | Reviewed evidence, no test regressions, independent release decision |

## D1 implementation contract
- Hero is replaced by **Start with a file**, a compact heading smaller than 32px; no slogan.
- File entry is first; supports drag/drop, file picker, selected-file state, local open, backup restoration, sample entry, and existing capability-filtered task choices.
- Saved documents are directly accessible; up to three recent documents have visible direct links.
- Common tasks use flat, compact icon-and-label rows; specialist tasks stay discoverable through the directory.
- Desktop home uses four task columns where space permits, then three and two at medium widths, and one on a phone.
- Dark-mode colors continue to use existing semantic tokens; no gradients and no external fonts/remote assets.

## Branch and safety
`design/d1-file-first-workspace` is isolated off the latest P17 development snapshot and targets P17, not `main`. No merge into P17 or P18 until browser/visual acceptance is completed. P18's frozen source baseline must **not** include these experimental visual changes by accident. UI tests are independent of PDF fidelity qualification and must not weaken the latter.

## Phase gate
For each phase: code diff + test results + representative desktop/phone captures + manual review of interactive focus, overflow and dark theme + no severe regressions. Do not describe a phase as fully qualified solely because a CSS build compiles.
