# Phase 32 Specification — Task-first Consumer Information Architecture

## Goal

Make PDF Studio easier to understand before the user knows any PDF-specific terminology. P32 reduces first-run decision cost by presenting concrete jobs first, moving specialist breadth behind the full tool catalogue, and preserving every existing engine, safety gate, and exact task route.

P32 is an information-architecture and presentation phase. It must not regress the interaction-critical-path performance qualified in P31.

## Product invariants

1. **Intent before implementation** — users choose jobs such as Edit, Merge, Organize, Compress, OCR, Fill forms, or Sign rather than choosing internal PDF subsystems.
2. **One canonical route per task** — Home, All PDF tools, command surfaces, and document workspaces continue to route through the canonical task catalogue.
3. **Progressive disclosure** — everyday tasks are visible immediately; advanced, recovery, and specialist workflows remain available without competing for first attention.
4. **No capability loss** — P32 may reorder, group, rename, or de-emphasize surfaces, but it does not remove supported PDF functionality.
5. **Truthful recovery** — local autosave is described as local browser recovery, not as a guarantee against browser storage deletion.
6. **Local-first remains structural** — task-first routing introduces no upload service, account dependency, analytics path, or remote processing.
7. **P31 performance remains authoritative** — native enrichment, drag/resize fast paths, rendering budgets, and existing performance qualification stay unchanged.

## Workstreams

### 1. Task-first Home

Home answers one question: **What do you want to do with your PDF?**

The first surface exposes eight common jobs from the canonical task catalogue:

- Edit PDF
- Merge PDFs
- Organize pages
- Split PDF
- Compress PDF
- OCR PDF
- Fill PDF forms
- Add visual signature

The task cards do not invent new routes. Document-scoped jobs route to the focused task entry point and request a PDF there. Standalone jobs such as Merge route directly to their existing tools.

### 2. Full tool catalogue as secondary breadth

The Tools page becomes the explicit **All PDF tools** catalogue. Search, capability states, advanced tools, specialist tasks, and recovery workflows remain available there. Copy emphasizes the user job rather than implementation technology.

### 3. Workspace continuation and recovery are secondary

Restore project, sample documents, recent local projects, and recovery guidance remain on Home but no longer compete with the task choice. Recovery copy explicitly states that browser storage can be cleared and that project backups remain useful.

### 4. Editor simplification

P32 treats the editor as an everyday editing surface rather than a catalogue of PDF technologies. Primary editing actions should remain immediately reachable, while less common shape, markup, review, and specialist actions may be grouped or visually de-emphasized through progressive disclosure.

This workstream must preserve all existing editor tools, keyboard shortcuts, exact task focus, native existing-content editing, and P31 interaction behavior.

### 5. Qualification

P32 adds regression coverage for the task-first Home hierarchy and retains the existing desktop workspace hierarchy checks. The full repository gates remain required before merge.

## Acceptance targets

- Home displays the task-first heading and eight popular task cards.
- The popular cards are backed by canonical task IDs rather than duplicate routing logic.
- `All PDF tools` is available as the complete catalogue.
- Restore/sample/recent-project actions remain available but secondary.
- Recovery language does not imply that browser-local storage is indestructible.
- Task capability gating and exact task focus remain unchanged.
- No editor or PDF capability is removed.
- P31 browser/performance regressions remain green.
- Desktop and mobile layouts introduce no horizontal overflow at qualified viewports.
- No remote processing path is added.

## Non-goals

- No new PDF engine or editing capability.
- No cloud storage, collaboration, account system, or telemetry.
- No certificate-backed signing work.
- No persistence schema migration.
- No replacement of R9 human usability qualification with automated tests.
- No weakening of preservation, validation, capability, or security gates.

## Rollback boundary

P32 is intentionally surface-oriented. If qualification exposes a regression, Home/Tools presentation changes can be reverted without changing project data, PDF transformation engines, or the P31 interaction architecture.
