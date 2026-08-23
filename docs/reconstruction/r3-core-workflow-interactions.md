# R3 — Core Workflow Interaction Reconstruction

R3 changes how the four R2 document destinations behave without adding PDF capabilities or replacing their processing engines.

## Goal

A user should be able to stay oriented through the full sequence:

**choose intent → act on the document → understand what changed → create an output → know where that output went**

The interface must make the next relevant action more prominent than implementation details, diagnostics, or unrelated controls.

## Interaction rules

### 1. Stable destinations

Read, Edit, Pages, and Tools remain the only primary document destinations. R3 does not introduce another mode taxonomy.

### 2. Context before completeness

A control should be visible because it applies to the current state, not merely because PDF Studio supports it somewhere.

- Page manipulation appears after page selection.
- Object properties appear after object selection.
- A selected PDF task opens its matching controls.
- Advanced search and technical document metadata are disclosures rather than permanent chrome.

### 3. One output vocabulary

The product distinguishes two user outcomes:

- **Download copy** — create and download a validated output without replacing the open project.
- **Save new project** — create a separate browser-local project and open that output.

The source/original project is not overwritten by these workflows.

### 4. No implementation-era product language

Normal workflows must not require users to understand phases, PDF object provenance, reconstruction pipelines, internal confidence percentages, worker names, or release terminology.

Technical evidence may remain available inside explicit technical details when it genuinely helps diagnosis.

### 5. Errors preserve orientation

Failures should appear beside the task that failed, retain the current document/task context, and allow dismissal or retry where possible. Long operations remain cancellable when their underlying operation supports cancellation.

## Read

Read is a document-consumption surface.

Primary chrome is limited to page navigation, zoom, view mode, and document navigation/search. Original-file download, project backup, and opening another PDF remain available under a Document disclosure. Search options and technical metadata are collapsed by default.

Large-document scheduling still runs automatically but its internal performance profile is no longer presented as ordinary reader chrome.

## Edit

Edit remains the unified existing-content + added-content editor.

R3 establishes these presentation rules:

- implementation-phase badges and queued-edit counters do not occupy the normal context bar;
- layer-list confidence percentages and z-order numbers are not default information;
- native capability confidence remains available in Technical details where the underlying property panels expose it;
- object/layout controls remain contextual to selection;
- the document header emphasizes that the original PDF is unchanged;
- advanced editing capability is preserved rather than removed.

A deeper source-language cleanup continues through R4's capability/error reconstruction where support-state explanations become authoritative across all engines.

## Pages

Pages is selection-first.

The persistent header contains history and output controls. Rotate, duplicate, delete, reverse-selection, and extract actions appear when pages are selected. When nothing is selected the interface teaches selection instead of showing a disabled wall of commands.

Page changes are staged and undoable until output creation. The preservation explanation is available under **What happens when I create an output?** instead of appearing as a permanent warning banner.

## Tools

Choosing a document utility must preserve intent through routing.

For example:

`Crop pages → choose/open PDF → Crop pages controls`

not:

`Crop pages → generic Toolbox → find Crop pages again`

Utility task IDs map directly to focused controls for crop, blank pages, metadata, watermark/page numbers, export, grayscale, and split. Generic utility tabs remain available only when a user deliberately opens the general document-utilities surface.

PDF transformations create a new local project and return to Read. Content-only exports download their artifacts without changing the project.

## Responsive behavior

R3 keeps R2's mobile Read/Edit/Pages/Tools navigation. Secondary Read administration is hidden from narrow command bars; page actions wrap/stack rather than creating horizontal toolbar pressure; existing mobile editor tool sheets remain the primary compact editing affordance.

R6 remains responsible for the full mobile/tablet reconstruction.

## Non-goals

R3 does not:

- add PDF processing algorithms;
- change database or package schemas;
- change worker protocols;
- weaken export validation;
- convert unsupported features into supported ones;
- certify usability metrics that have not been measured with users.

## Handoff

R4 — Reliability & Capability-Gating Reconstruction consumes this interaction model and makes support state truthful before execution: available, warning, experimental, unsupported-for-document, temporarily unavailable, or hidden.