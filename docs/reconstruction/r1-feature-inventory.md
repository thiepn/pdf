# R1 — Feature Inventory & Ruthless Simplification

Status: **implemented on the R1 branch; acceptance pending repository qualification**

This document records the first whole-product feature audit after the R0 reconstruction constitution. It is based on the actual v7 source surface, not README feature claims.

The authoritative row-level inventory is [`feature-registry.csv`](./feature-registry.csv). The registry contains **134 user-intent capabilities**. Supporting controls such as individual font-size inputs, page-number spinners, close buttons, and ordinary dialog controls are intentionally not treated as separate features unless they create a distinct user intent.

## R1 conclusion

PDF Studio does not primarily suffer from missing PDF engines. It suffers from **exposure architecture**:

1. valuable capabilities are buried inside generic containers;
2. multiple containers expose overlapping versions of the same intent;
3. technical and release-engineering surfaces compete with ordinary PDF work;
4. old specialist implementations remain visible after stronger v7 replacements shipped;
5. the command palette indexes modes rather than user tasks;
6. Simple mode still requires users to understand seven workspace modes;
7. some feature names describe subsystems instead of goals;
8. developer evidence such as phase names, capability confidence, object-model terminology, and z-order leaks into normal editing;
9. support/release utilities occupy navigation positions that imply normal product relevance;
10. several unsupported or bounded capabilities need a more explicit capability state before execution.

The correct response is **not to delete the underlying engines indiscriminately**. R1 separates two questions:

- Is the capability worth retaining?
- Does the capability deserve a first-class visible entry point?

Most PDF engines survive. Many containers and entry points do not.

---

## Audit method

R1 inspected the actual source surfaces for:

- application shell and routing;
- Home;
- Documents/projects;
- workspace mode rail and mobile mode menu;
- command palette;
- Read/viewer capabilities;
- unified Edit;
- Pages organizer;
- Toolbox;
- Optimize/compression;
- OCR;
- Forms & Protect;
- Create PDF;
- Scan to PDF;
- Compare;
- Batch;
- Print & Advanced;
- Accessibility & Standards;
- Inspect;
- Repair;
- Preservation;
- legacy native-edit compatibility route;
- Settings;
- local storage and maintenance;
- Diagnostics;
- App self-check;
- Download history;
- About/release information;
- Help.

Every user-intent capability is assigned the R0 A–H classification, a truthful support state, and one primary action:

- `KEEP`
- `REPAIR`
- `MERGE`
- `DEMOTE`
- `HIDE`
- `REMOVE`

No capability is classified as reliable merely because a button exists.

---

# Major findings

## 1. The application has two information architectures at once

The global shell exposes:

- Home
- Documents
- Tools
- Settings
- Help

Once a document opens, the workspace introduces another architecture:

- Read
- Edit
- Pages
- Tools
- Optimize
- Forms & Protect
- OCR
- Accessibility
- Print & Advanced
- Inspect
- Repair
- Preservation

Simple mode still exposes seven document modes. Advanced adds specialist modes and a separate technical strip. This creates a taxonomy-learning burden before a user can perform a task.

**R1 decision:** keep the underlying workspaces temporarily for compatibility; classify the mode rail as `REPAIR`; rebuild it around canonical user tasks in R2.

## 2. Generic containers hide real capabilities

Three containers are especially problematic:

### Tools / Toolbox

It combines:

- watermarks;
- headers/footers;
- page numbers;
- crop;
- blank pages;
- metadata;
- text export;
- Markdown export;
- HTML export;
- page images;
- split ZIP;
- grayscale.

The capabilities are useful. The generic container is not.

**Decision:** capabilities mostly `KEEP`; Toolbox container `MERGE`.

### Forms & Protect

It combines:

- security inspection;
- form filling;
- permanent redaction;
- signature inspection;
- sanitization;
- password protection;
- PDF permissions.

These are separate user intentions.

**Decision:** capabilities mostly `KEEP`; container `MERGE`.

### Print & Advanced

It combines:

- an older text editor;
- an older image replacer;
- Bates numbering;
- print imposition;
- layer visibility;
- archive checking;
- DOCX export.

This is a classic junk drawer.

**Decision:** remove the obsolete text/image routes from normal exposure, keep the useful specialist tasks, dissolve the container in R2.

## 3. v7 contains obsolete duplicate editing paths

The unified v7 editor supports source text, images, vectors, detected tables, supported forms, nested groups, annotations, and added objects on one canvas.

`Print & Advanced` still exposes older Text and Images workflows. Those paths are less capable and use different limitations.

**R1 decision:**

- legacy Professional text replacement: `REMOVE` from product exposure;
- legacy Professional region image replacement: `REMOVE` from product exposure;
- keep internal implementation only until compatibility and dependency analysis permits deletion.

A user should never have to decide which text editor is the “real” one.

## 4. Preservation is an implementation-driven workspace

Preservation currently exposes:

- a structure graph;
- structure-safe optimize;
- vector print layout.

But:

- structure graph overlaps Inspect;
- structure-safe optimize overlaps Optimize and P8 fidelity checks;
- vector print layout overlaps Print imposition.

**R1 decision:** standalone Preservation mode = `REMOVE`; merge its strongest guarantees/engines into canonical Optimize and Print Layout paths. Keep compatibility state until migration work is complete.

## 5. Inspect is useful but not an everyday mode

The document inspector can provide valuable structural and security evidence. It is not a normal editing destination.

**R1 decision:** `DEMOTE` to Document details / Troubleshooting / More. Never suggest it merely because a document lacks bookmarks.

## 6. Repair is valid but belongs to troubleshooting

Repair has a clear user intent: a PDF is damaged or behaves incorrectly, and the user wants a clean rewritten copy.

**R1 decision:** keep the engine and workflow, but move it out of the normal workspace mode taxonomy into Troubleshooting/More.

## 7. Compliance has valuable specialist functions but another overloaded container

Accessibility & Standards currently contains:

- standards preflight;
- PDF/A candidate preparation;
- accessibility inspection/repair;
- signature inspection/evidence;
- form-field authoring.

The first three are coherent specialist capabilities. Signatures and forms overlap other product areas.

**R1 decision:** dissolve the container during R2. Keep standards/accessibility as specialist tasks under More. Reconcile form authoring separately before it is advertised as mature.

## 8. Form authoring has a product-consistency problem

Forms & Protect explicitly tells the user that production-ready arbitrary field creation is deferred. The Compliance implementation nevertheless exposes draft field creation.

That does not necessarily mean the implementation is broken, but it means the product currently communicates two different capability contracts.

**R1 decision:** classify new-field authoring as `D / experimental / REPAIR` until R3/R4 can:

1. define exactly which field types are supported;
2. run representative creation/export/reopen tests;
3. capability-gate unsupported field types;
4. expose one canonical Forms workflow.

## 9. Digital signatures need one strict vocabulary

PDF Studio has:

- visual signature appearances;
- embedded signature-field inspection;
- ByteRange/evidence analysis;
- detached signature evidence;
- no built-in certificate-backed PDF signing.

**R1 decision:**

- visual signature: keep as everyday signing appearance, always labelled visual/appearance when ambiguity exists;
- inspect existing digital signatures: keep as specialist capability;
- detached evidence: demote to technical evidence;
- certificate-backed signing: hidden/unavailable until a real signer integration exists.

The UI must never make an image signature look equivalent to a cryptographic PDF signature.

## 10. Metadata removal has too many homes

The same intent appears in:

- Optimize;
- Toolbox Metadata;
- Forms & Protect Sanitize;
- Batch.

Contextual shortcuts are acceptable; independent mental models are not.

**R1 decision:** define one canonical action ID: `remove-metadata`. R2 can surface shortcuts while routing to one understandable contract.

## 11. Print imposition is duplicated

Print & Advanced and Preservation both expose imposition variants with different preservation properties.

**R1 decision:** `MERGE` into one Print Layout workflow that chooses or explains the appropriate engine rather than asking users to know the difference.

## 12. Archive/preflight is duplicated

Professional Archive and Compliance Standards/PDF-A overlap.

**R1 decision:** Compliance becomes the canonical standards implementation; Professional Archive is merged away.

## 13. Diagnostics and release validation are not navigation destinations

Diagnostics contains explicit engineering laboratories for:

- deployment;
- PDF.js;
- MuPDF;
- coordinates;
- storage probes.

App self-check is explicitly a release verification tool.

**R1 implementation:** both remain routable through Help/About but were removed from the normal application Support menu.

## 14. Home advertised engineering foundations instead of user tasks

Home previously displayed:

- PWA readiness;
- local-first processing architecture;
- shared validation pipeline;
- preservation architecture.

These are product qualities, not jobs the user came to perform. PWA readiness was also duplicated in Settings.

**R1 implementation:** removed this technical material from Home. Home now focuses on opening/resuming a document and reaching common PDF tasks.

## 15. The editor leaks implementation vocabulary

Examples in the current Edit UI include:

- `P6`;
- `PDF + overlay objects`;
- source/native object language;
- capability confidence percentages;
- queued implementation edits;
- z-index values.

The information may be valuable for diagnostics, but it is not suitable as normal editing language.

**R1 decision:** classify phase labels as `REMOVE` and confidence/internal object metadata as `HIDE`. R2/R3 will replace visible strings with task-oriented language without weakening capability gating.

## 16. The command palette is a mode search, not a command palette

Inside a document it mainly exposes commands such as:

- Read current PDF;
- Edit current PDF;
- Pages current PDF;
- Optimize current PDF;
- Inspect current PDF.

It does not reliably expose canonical task intents such as:

- crop pages;
- remove metadata;
- sign;
- split;
- watermark;
- flatten forms.

**R1 decision:** `REPAIR`. R2 must build an action registry with synonyms and capability-aware destinations.

---

# Immediate simplifications implemented in R1

R1 intentionally does not perform the full R2 information-architecture rewrite. It does remove obvious clutter that has no dependency on the new IA.

## Home

Removed:

- duplicate PWA-readiness card;
- engineering “foundation” cards;
- validation/preservation architecture marketing.

Replaced with a compact Common tasks strip and direct language focused on what users can do.

## Global Support navigation

Removed from normal sidebar exposure:

- Local storage diagnostics;
- Engineering Diagnostics;
- App self-check.

These routes remain available from Help/About for support and release work. No engine or support capability was deleted.

The Support disclosure now contains only:

- Download history;
- Troubleshooting & recovery;
- About this app.

---

# R2 handoff rules

R2 must treat `feature-registry.csv` as authoritative unless a new source audit proves a row wrong.

R2 may not preserve a container solely because deleting it is inconvenient. The intended destination model is user-intent based.

At minimum R2 must:

1. dissolve Toolbox as a user-facing mental model;
2. decompose Forms & Protect;
3. dissolve Print & Advanced;
4. remove Preservation as a standalone user-facing mode;
5. demote Inspect and Repair from the primary mode rail;
6. replace mode-oriented command search with canonical task actions;
7. preserve legacy routes only as redirects where required;
8. keep specialist functionality under progressive disclosure;
9. expose one canonical destination for duplicate intents;
10. retain truthful capability gates and preservation warnings.

---

# What R1 does not claim

R1 does **not** claim that every existing function has now been manually proven reliable on arbitrary real-world PDFs. R0 explicitly prohibits that inference.

The registry uses release-gate evidence where available and marks bounded/contradictory/incomplete functions accordingly. Representative workflow reliability remains an R3/R4/R8 qualification responsibility.
