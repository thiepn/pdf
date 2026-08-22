# R0 Product Constitution

## 1. Product definition

**PDF Studio is a private, local-first PDF editor for everyday and advanced document work. Common tasks must be fast and understandable; specialist capabilities must remain available without dominating the normal experience.**

PDF Studio is not defined by the number of PDF operators, engines, utilities, or modes it exposes. It is defined by whether a user can complete a supported document task safely, predictably, and with an output they can trust.

## 2. Audience priority

The interface and roadmap must optimize for these audiences in order.

### Tier 1 — Everyday document user

Primary needs:

- open/read/search a PDF;
- edit existing text;
- add text or images;
- annotate/highlight/comment/draw;
- sign visually;
- redact permanently;
- merge/split/reorder/rotate/crop pages;
- compress;
- OCR scans;
- fill forms;
- protect or sanitize a document;
- perform simple conversions.

Tier 1 workflows own the default navigation, labels, empty states, and help language.

### Tier 2 — Power user

Secondary needs:

- batch processing;
- compare documents;
- Bates numbering;
- metadata controls;
- advanced page operations;
- accessibility inspection/repair;
- structured document sanitization;
- repeatable recipes and technical export options.

Tier 2 features may be first-class where justified, but must not make Tier 1 harder.

### Tier 3 — Technical/professional specialist

Specialist needs:

- PDF structure inspection;
- repair;
- preservation/fidelity diagnostics;
- archival preparation;
- signature coverage inspection;
- release/runtime diagnostics;
- maintenance and support evidence.

Tier 3 functionality belongs behind progressive disclosure or a dedicated advanced/diagnostic surface.

## 3. Product principles

### P1 — Intent-first organization

UI labels and navigation describe user goals. Internal names such as worker type, reconstruction method, schema phase, content-stream implementation, or engine identity must not define primary navigation.

### P2 — Truthful affordances

A visible action must communicate its support state before the user commits unnecessary work whenever that state can be determined in advance.

The acceptable states are:

1. **Available** — expected to work for the current document/context.
2. **Available with warning** — supported, but has a material consequence the user should understand first.
3. **Experimental** — intentionally exposed but not release-grade; must be explicitly labeled and isolated from normal promises.
4. **Unavailable for this document/context** — visible only when explanation or discovery value justifies it; disabled with a useful reason and alternative when possible.
5. **Temporarily unavailable** — environment/browser/resource limitation; provide a concrete recovery path where possible.
6. **Hidden** — incomplete, low-value, unsafe, or not useful enough to justify product complexity.

A predictable unsupported state is preferable to an unexpected runtime error.

### P3 — Progressive disclosure

Default controls expose the smallest set needed to complete the task. Advanced technical controls are collapsed, secondary, or moved to specialist surfaces.

### P4 — One canonical action

Each major user intent has one canonical name, one canonical conceptual location, and one canonical implementation entry point. Secondary shortcuts may exist, but they must route to the same action rather than creating divergent workflows.

### P5 — Safe over clever

When the application cannot preserve a document safely, it must refuse, warn, or offer a lower-fidelity alternative rather than silently approximating success.

### P6 — Consequences in user language

Users need to know what may be lost, not which engine caused the loss.

Preferred:

> This operation converts pages to images. Selectable text, links, forms, and vector editability will be lost.

Not preferred in normal UI:

> Raster derivative using reconstruction pipeline X.

### P7 — Privacy remains structural

Document bytes, extracted text, OCR results, form data, passwords, and generated output remain local by default. Product reconstruction must not trade away the local-first model merely to simplify implementation.

### P8 — Real workflows are acceptance criteria

A feature is not considered product-complete solely because a unit test or fixture passes. Product-complete means the relevant golden workflow can be found, understood, executed, exported, reopened, and validated on representative real-world documents.

### P9 — Removal is a valid improvement

Deleting, hiding, or merging a feature is a positive product change when it reduces confusion, removes false promises, or improves the reliability of the remaining product.

### P10 — Feature expansion is frozen

Until R8 certification, no new major PDF capability should be added unless it directly:

- repairs a golden workflow;
- fixes security/privacy/data-loss risk;
- replaces a misleading or broken existing capability;
- is required to complete the reconstruction itself.

## 4. Product boundaries

PDF Studio may remain intentionally weaker than major native commercial suites in areas such as:

- certificate-backed signing and enterprise signature workflows;
- high-fidelity Office conversion;
- XFA editing;
- complete PDF/UA remediation;
- certified PDF/A validation;
- professional prepress and color-management workflows;
- arbitrary complex-script/static text reconstruction without shaping support;
- deep native OS/scanner/certificate-store integration;
- cloud collaboration.

These are acceptable boundaries if the product communicates them honestly.

## 5. Interaction doctrine

### Common actions

Common actions must be visible, predictable, and short.

### Rare actions

Rare actions must remain searchable but need not occupy permanent primary UI.

### Technical actions

Technical actions may be powerful without being prominent.

### Destructive actions

Destructive actions must state:

- what changes;
- whether it is staged or permanent;
- whether undo is available;
- what export may lose.

## 6. Release doctrine

A reconstruction release is not certified by automated green status alone. Certification requires all of the following:

- automated unit/integration/browser gates;
- migration/security/privacy/reproducibility gates;
- representative real-world PDF corpus;
- golden-workflow qualification;
- capability-gating validation;
- manual visual QA;
- usability/findability evidence.

A correctly blocked unsupported workflow counts as a successful product outcome. A misleading action that fails late does not.

## 7. Non-goals for R0-R8

The reconstruction is not intended to:

- maximize the number of features;
- expose every internal capability;
- convert PDF Studio into a cloud collaboration suite;
- replace conservative PDF safety with aggressive approximation;
- redesign internals merely for aesthetic code cleanliness when no product benefit exists.

## 8. Decision test

Before keeping, adding, promoting, or exposing a feature, ask:

1. Which user tier needs it?
2. Which user intent does it satisfy?
3. Is it reliable on representative documents?
4. Can support eligibility be determined before execution?
5. Does another visible feature satisfy the same intent?
6. Does exposing it make common workflows harder to find?
7. Can its consequences be explained without implementation jargon?
8. Would hiding or removing it make the product better?

If those questions do not produce a clear justification, the feature should not occupy primary UI.
