# R2 — Information Architecture Reconstruction

## Objective

Replace PDF Studio's subsystem-oriented navigation with a task-oriented product architecture while preserving the existing PDF engines, project formats, persistence model, and legacy deep routes.

R1 established that the product already contains substantial capability; the primary usability defect is exposure complexity. R2 therefore changes how capabilities are named, found, grouped, and entered rather than rebuilding processing engines.

## Product rule

A user should not need to know whether an action is implemented by the editor, toolbox, security engine, OCR pipeline, compliance workspace, preservation pipeline, or professional workspace.

The user supplies an intent. PDF Studio selects the implementation surface.

## Stable application navigation

The global application navigation remains:

1. Home
2. Documents
3. Tools
4. Settings
5. Help

Low-frequency support remains under the collapsed Support disclosure.

## Stable document navigation

Every open document exposes exactly four primary destinations:

1. **Read** — view, search, thumbnails, outline, document information, original download and project backup.
2. **Edit** — supported existing-content editing plus inserted content, annotations, review markup, visual signatures and redaction marks.
3. **Pages** — reorder, rotate, duplicate, delete, reverse and extract pages.
4. **Tools** — task launcher for all other document outcomes.

OCR, Protect, Compress, Accessibility, Specialist tools, Repair, Document details, and compatibility workspaces remain implementation destinations reachable through tasks/deep links. They are not peer navigation tabs.

When a specialist workspace is active, **Tools remains the active primary destination**.

## Canonical task taxonomy

`src/ia/taskCatalog.ts` is the authoritative runtime task catalog.

### Create & combine

- Create PDF
- Merge PDFs
- Scan to PDF

### Edit & annotate

- Edit PDF
- Annotate & comment
- Add visual signature
- Mark areas for redaction

### Pages

- Organize pages
- Split PDF
- Crop pages
- Insert blank pages
- Watermark & page numbers

### Protect & sign

- Fill PDF forms
- Apply permanent redactions
- Sanitize PDF
- Password-protect PDF
- Flatten supported PDF content

Visual signing remains deliberately separate from certificate-backed digital signing, which is not represented as an available built-in task.

### Convert & optimize

- OCR PDF
- Compress PDF
- Edit or remove metadata
- Export PDF content
- Create grayscale PDF

### Review & accessibility

- Compare PDFs
- Check accessibility
- Prepare print layout
- Add Bates numbering
- Check archive readiness

### Automate

- Batch automation

### Recovery-only discovery

- Repair PDF
- Document technical details

Recovery tasks are absent from the default task browser. They appear through search or Help when relevant.

## One catalog, multiple entry points

The same task definitions drive:

- global Tools;
- current-document Tools;
- Ctrl/Cmd + K command search;
- labels, descriptions, synonyms and audience tier;
- destination selection.

This prevents the previous drift where Tools, workspace navigation, command search, Help and internal modes each described the product differently.

## Search model

Command search now indexes user verbs and synonyms rather than workspace mode names.

Examples:

- `crop` → Crop pages
- `remove metadata` → Edit or remove metadata
- `sign` → Add visual signature
- `redact` → Mark areas for redaction / Apply permanent redactions
- `split` → Split PDF
- `OCR` → OCR PDF
- `booklet` → Prepare print layout
- `Bates` → Add Bates numbering
- `broken PDF` → Repair PDF

When a document is not open, document-bound tasks route through a task-aware Tools URL so the requested intent survives until file selection.

## Progressive disclosure

R2 retires the consumer-facing global **Simple / Advanced** workspace switch.

The persisted `experienceMode` schema field remains for migration/backward compatibility, but no longer defines navigation.

Progressive disclosure is now local to the task:

- everyday tasks are visible by default;
- advanced tasks carry an Advanced label but stay in the relevant outcome category;
- recovery tasks are search/Help driven;
- low-level Document utilities are contained in a disclosure;
- technical revision/transaction/event history is contained under Technical history;
- What changes? remains optional.

## Terminology normalization

Internal/deep-route labels are simplified where they remain visible:

| Previous label | R2 label |
| --- | --- |
| Forms & Protect | Protect |
| Optimize | Compress |
| Inspect | Document details |
| Print & Advanced | Specialist tools |
| Preservation | Structure check |
| Legacy native edit | Legacy edit |
| Accessibility & Standards | Accessibility |

These labels no longer define primary navigation.

## Compatibility boundaries

R2 intentionally does **not** delete legacy workspace modes or processing engines.

Existing deep links, saved workspace state and compatibility routes remain readable. A previously saved specialist `lastMode` can still reopen that implementation surface, but the primary navigation presents it as part of Tools.

No R2 change requires:

- project schema migration;
- database schema migration;
- worker protocol changes;
- PDF processing algorithm changes;
- output format changes;
- source-document mutation.

## Help and recovery

Help now teaches Read / Edit / Pages / Tools and task search. It no longer tells users to switch the whole workspace to Advanced.

History keeps restorable checkpoints visible. Revision lineage, document transactions and workspace events remain available under **Technical history** instead of dominating the normal recovery panel.

## R3 handoff

R2 establishes where capabilities live and how they are found. It does not attempt to redesign every individual task surface.

The next phase should treat the reconstructed information architecture as fixed and improve the interaction model inside the core workflows rather than reintroducing parallel navigation taxonomies.
