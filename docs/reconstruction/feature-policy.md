# R0 Feature Exposure and Simplification Policy

## 1. Purpose

This policy governs every user-visible PDF Studio capability during R1-R8. It exists to prevent feature accumulation from recreating the current problems of clutter, duplication, poor findability, and controls that imply support more strongly than the implementation warrants.

R1 must inventory every visible command, tool, mode, panel, menu item, context action, setting, command-palette action, and specialist surface against this policy.

## 2. Feature classification

Each feature receives one primary class.

| Class | Name | Definition | Default action |
| --- | --- | --- | --- |
| **A** | Essential + reliable | High-frequency or release-critical user task with representative evidence | Primary UI |
| **B** | Useful + reliable | Valuable, dependable capability that does not need constant prominence | Normal UI / contextual UI |
| **C** | Useful + niche | Real value for a smaller audience | Advanced / More / contextual disclosure |
| **D** | Useful + unreliable | Valuable capability that currently fails, misleads, or lacks sufficient evidence | Repair before normal exposure |
| **E** | Redundant | Duplicates another user intent or creates competing workflows | Merge into canonical action |
| **F** | Technical / diagnostic | Primarily engineering, inspection, maintenance, or specialist evidence | Technical/diagnostic surface |
| **G** | Low-value | Exists but does not justify cognitive or maintenance cost | Remove |
| **H** | Incomplete / unsupported | UI suggests a capability that is not product-complete | Hide until qualified, or expose only as explicit experimental functionality |

Class is about the **user-facing product**, not the cleverness or difficulty of the underlying implementation.

## 3. Required registry fields for R1

Every inventoried feature must record:

- `feature_id`
- `canonical_name`
- `user_intent`
- `audience_tier` (`1`, `2`, `3`)
- `current_location`
- `current_secondary_locations`
- `proposed_location`
- `classification` (`A`-`H`)
- `support_state`
- `reliability_evidence`
- `known_limitations`
- `destructive_or_lossy` (`yes/no`)
- `requires_capability_preflight` (`yes/no`)
- `canonical_action_id`
- `action` (`keep`, `repair`, `merge`, `demote`, `hide`, `remove`)
- `rationale`

The registry becomes authoritative for R2 navigation and R3 workflow reconstruction.

## 4. Support-state model

A feature's classification and its runtime support state are separate concepts.

Runtime support state must use one of:

### `available`

The current document/context satisfies the qualified support contract.

### `available-with-warning`

The action is supported but has a material consequence, such as rasterization, flattening, structure loss, or a non-secure operation that may be confused with secure removal.

### `experimental`

The capability is intentionally exposed before release-grade qualification. It must be clearly labeled and cannot be the only route for a golden workflow.

### `unsupported-for-document`

The current document contains a known unsupported condition. The action should be disabled or redirected before execution where that condition can be detected.

### `temporarily-unavailable`

Browser, platform, storage, memory, missing language pack, password state, or another environmental condition prevents execution. The UI should explain how to recover where possible.

### `hidden`

The feature should not appear in normal UI because it is incomplete, unsafe, misleading, obsolete, redundant, or not valuable enough.

## 5. Canonical-action rule

Each user intent gets one canonical action ID and one canonical conceptual location.

Allowed:

- primary navigation entry;
- command-palette/search shortcut;
- context-sensitive shortcut;
- home/recent-task shortcut.

All must route into the same conceptual workflow and share naming, support preflight, warnings, and output semantics.

Not allowed:

- separate implementations with different defaults for the same intent;
- different names for the same operation without a compelling domain distinction;
- duplicate pages/panels that drift in capability or reliability.

## 6. Exposure rules by audience tier

### Tier 1

May occupy:

- primary navigation;
- persistent toolbars when contextually justified;
- empty-state common actions;
- direct command search.

Tier 1 labels must use ordinary document language.

### Tier 2

May occupy:

- contextual panels;
- secondary navigation;
- More/Advanced;
- command search.

Tier 2 must not make Tier 1 scanning or navigation materially harder.

### Tier 3

Belongs under:

- Document diagnostics;
- Advanced;
- Inspect/Repair;
- maintenance/support surfaces;
- technical details disclosures.

Tier 3 should not compete visually with Edit, Pages, OCR, Compress, Redact, Sign, or other Tier 1 tasks.

## 7. Reliability rule

A feature must not be promoted to A or B unless there is representative evidence that its intended workflow is dependable.

Evidence hierarchy:

1. real-world workflow qualification on representative PDFs;
2. external-reader/output validation;
3. browser E2E/integration tests;
4. unit tests;
5. static implementation existence.

Lower levels support higher levels but do not substitute for them.

## 8. Preflight rule

When an unsupported state can be determined before execution, the product must preflight it before the user commits meaningful work.

Examples include:

- XFA where mutation is unsupported;
- unsupported signature field mutation;
- known clipping/pattern/shading structures that cannot be rewritten safely;
- password/encryption requirements;
- missing OCR language pack;
- insufficient storage quota where an estimate is available;
- browser API unavailability;
- known complex-script reconstruction boundary;
- operation that necessarily rasterizes interactive/vector structure.

Preflight should produce a support state, reason, and safe alternative where one exists.

## 9. Warning rule

Warnings are reserved for material consequences and should answer:

1. What will happen?
2. What may be lost?
3. Is the change permanent in the exported copy?
4. Is there a safer alternative?

Avoid warning fatigue. Informational implementation details belong in technical disclosure, not modal warnings.

## 10. Removal and demotion rules

A feature should be demoted, hidden, merged, or removed when one or more apply:

- fewer than a meaningful number of users need it and it occupies persistent space;
- another canonical action satisfies the same intent;
- its normal use requires internal PDF knowledge not justified by the task;
- it repeatedly produces unsupported/runtime errors;
- its output contract is too weak for the promise implied by the label;
- it exists primarily because the engine can do it rather than because a user needs it;
- maintaining it harms reliability of higher-priority workflows;
- it is historical/debug/release infrastructure exposed to consumers.

Removal does not require deleting underlying reusable code. The objective is to remove unjustified **product exposure**.

## 11. Naming rules

Prefer action-oriented names:

- `Compress PDF`
- `OCR PDF`
- `Merge PDFs`
- `Remove metadata`
- `Redact`
- `Fill form`

Avoid internal architecture terms in normal UI:

- worker names;
- phase identifiers;
- schema versions;
- reconstruction classes;
- source-stream terminology;
- engine implementation names.

Specialist terms may remain where the target audience needs them, but plain-language context should be provided when practical.

## 12. Experimental-feature rules

Experimental exposure is exceptional, not a loophole.

An experimental feature must:

- be explicitly labeled `Experimental`;
- not be required for a G1 workflow;
- document known failure boundaries;
- fail safely;
- not claim release certification;
- have an exit criterion for promotion or removal.

## 13. R1 decision order

For each feature, R1 should ask in this order:

1. Does this map to a real user intent?
2. Is that intent already served elsewhere?
3. Which audience tier owns it?
4. Is it reliable on representative documents?
5. Can eligibility be preflighted?
6. Does the current name/location match user expectation?
7. Does persistent exposure justify its cognitive cost?
8. Keep, repair, merge, demote, hide, or remove?

## 14. Success criterion

R1 is successful when the resulting feature surface is easier to predict and trust, not when it reaches a predetermined feature-count reduction.

A smaller visible product with better completion and reliability metrics is preferred to a larger product that requires users to understand the implementation or discover limitations through errors.
