# R0 UX, Reliability, and Product Metrics

## 1. Measurement policy

R0 distinguishes **measured evidence** from **targets**.

A metric must be marked `UNMEASURED` until a repeatable test produces evidence. Automated release success must not be substituted for usability evidence.

Allowed status values:

- `UNMEASURED`
- `BASELINE RECORDED`
- `TARGET MET`
- `TARGET MISSED`
- `NOT APPLICABLE`

## 2. Baseline status at R0

PDF Studio has strong automated engineering evidence from the existing v7 qualification chain, including unit/runtime checks, adversarial corpus validation, reproducible builds, dependency/security audits, and cross-browser Playwright coverage.

The following product metrics are **not yet proven by that evidence** and begin R0 as `UNMEASURED`:

- first-try tool findability;
- time-to-tool for common actions;
- golden-workflow completion rate on representative third-party PDFs;
- rate of late unsupported-operation failures;
- user comprehension of destructive/rasterizing consequences;
- real manual mobile task completion;
- primary-navigation prediction accuracy;
- unused/low-value visible-control rate.

R1-R8 must establish those baselines and then meet the targets below.

## 3. Primary targets

| Metric | Definition | R0 baseline | Reconstruction target |
| --- | --- | --- | --- |
| **Top-20 tool findability** | User identifies the correct entry point without Help | UNMEASURED | **>= 90% first-location accuracy** |
| **Top-20 locate depth** | Meaningful interactions from open document to canonical tool surface | UNMEASURED | **<= 2 for discovery** |
| **Top-10 workflow completion** | User completes supported task without Help | UNMEASURED | **>= 90%** |
| **Supported golden-workflow pass rate** | Find -> understand -> execute -> export -> reopen -> validate | UNMEASURED | **>= 98%** |
| **Misleading unsupported actions** | Action appears supported but fails for a pre-detectable unsupported condition | UNMEASURED | **0** |
| **Known critical/data-loss defects** | Open release defects with critical or data-loss impact | Existing release gates only | **0** |
| **Unexpected generic errors in golden workflows** | Unclassified internal error presented during supported workflow | UNMEASURED | **0** |
| **Canonical-action duplication** | Same user intent implemented as divergent visible workflows | UNMEASURED | **0 unjustified duplicates** |
| **Primary UI technical jargon** | Internal implementation term required to complete Tier-1 task | UNMEASURED | **0 required jargon** |
| **Manual responsive blockers** | Workflow cannot complete because of viewport/keyboard/overflow issue | UNMEASURED | **0 top-workflow blockers** |

## 4. Findability protocol

For each tested action:

1. Start from an open representative PDF and neutral workspace state.
2. State the task using user language, not the product's current label.
3. Record the first location chosen.
4. Record whether Help/search was required.
5. Record meaningful interaction count until the canonical tool is visible.
6. Record ambiguous competing locations.

Example prompts:

- "Make this PDF smaller."
- "Remove pages 4 through 7."
- "Make this scan searchable."
- "Permanently hide this account number."
- "Combine these two PDFs."

A synonym resolved by universal tool search counts as successful discovery, but primary-navigation testing must also be recorded separately.

## 5. Golden-workflow protocol

Every golden workflow is evaluated across six dimensions:

### Find
Can the intended user locate the action?

### Understand
Do labels, defaults, warnings, and options communicate what will happen?

### Execute
Does the supported operation complete without unexpected error?

### Recover
Can the user cancel, undo, or understand irreversible boundaries where applicable?

### Export
Is the resulting output produced through a clear save/download/replace-working-copy path?

### Reopen and validate
Does the output reopen, preserve required invariants, and contain the intended result?

Result values:

- `PASS`
- `PASS WITH EXPECTED LIMITATION`
- `BLOCKED CORRECTLY`
- `FAIL`

`BLOCKED CORRECTLY` is a successful product result when the operation is genuinely outside the support contract and the reason is communicated before unsafe work occurs.

## 6. Reliability metrics

### Late-failure rate

Count operations where the application could have determined non-support before execution but allowed execution to start and then failed.

**Target: 0 in qualified workflows.**

### Unclassified-error rate

Count user-visible failures that do not identify one of:

- user-correctable input;
- document limitation;
- browser/platform limitation;
- resource/storage limitation;
- product defect.

**Target: 0 in qualified workflows.**

### Output-validation rate

Every modifying golden workflow must reopen and validate its output when technically meaningful.

**Target: 100%.**

## 7. Information-architecture metrics

### Navigation prediction accuracy

Users are given task names and asked which top-level area they expect to use before interacting with the app.

**Target: >= 90% for the top 20 actions.**

### Duplicate-surface count

Count user intents with multiple competing primary locations.

**Target: 0 unless a documented secondary shortcut routes to the same canonical action.**

### Primary-navigation count

R2 should prefer a small stable number of task-oriented destinations. The exact count is not frozen by R0, but any increase must be justified by improved prediction accuracy and reduced interaction depth.

## 8. Visual and responsive metrics

Qualify at minimum:

### Desktop

- 1366x768
- 1920x1080
- 2560x1440

### Browser scaling / zoom

- 100%
- 125%
- 150%
- 200%

### Tablet

- portrait
- landscape

### Phone

- narrow Android-class viewport
- iPhone-class viewport

For top workflows record:

- clipped controls;
- horizontal application-shell overflow;
- hidden primary action;
- keyboard obstruction;
- unusable touch target;
- hover-only dependency;
- unexpected scroll owner;
- viewport jump.

**Target: zero workflow-blocking responsive defects.**

## 9. Performance perception targets

Exact budgets remain governed by existing performance gates. R0 additionally defines product-facing expectations:

- navigation and panel switches should respond immediately without unexplained blocking;
- specialist engines should initialize only when required;
- long operations must show named progress rather than indefinite generic spinners where progress is knowable;
- cancel/pause controls must be shown when the underlying operation safely supports them;
- loading state must identify what is being prepared.

## 10. Complexity metrics for R1

R1 will record:

- total visible commands;
- total top-level destinations;
- total persistent toolbar controls;
- duplicate intent count;
- controls classified A-H under `feature-policy.md`;
- controls moved to Advanced;
- controls hidden;
- controls removed;
- controls that require reliability repair.

R0 does **not** prescribe a quota such as "remove 30%". Simplification is judged by lower ambiguity and better workflow metrics, not arbitrary deletion count.

## 11. Evidence storage

Reconstruction evidence should live under `docs/reconstruction/evidence/` or phase-specific reports and include:

- test date and commit SHA;
- environment/browser/device;
- document corpus identifier;
- workflow identifier;
- expected support state;
- result;
- defect or limitation reference where applicable.

No document contents, passwords, personal data, or confidential source material should be committed as evidence.
