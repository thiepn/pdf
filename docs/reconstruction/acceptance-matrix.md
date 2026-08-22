# R0 Acceptance Matrix

## 1. Scope

R0 freezes the standards for the reconstruction program. It does **not** change PDF behavior, navigation, or end-user visuals. R0 passes only when the product doctrine, measurable targets, workflow set, exposure policy, and future evidence model are explicit enough to govern R1-R8 without relying on chat history.

## 2. Acceptance criteria

| ID | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| R0-01 | Product definition is frozen around local-first, trustworthy PDF work rather than feature count | `product-constitution.md` §1 | PASS |
| R0-02 | Audience priority is explicit and ordered Tier 1 -> Tier 2 -> Tier 3 | `product-constitution.md` §2 | PASS |
| R0-03 | Feature expansion is frozen during reconstruction except for defined repair/security exceptions | `product-constitution.md` P10; reconstruction README | PASS |
| R0-04 | User intent outranks internal engine/phase architecture | Constitution P1 | PASS |
| R0-05 | Runtime capability states are standardized | `feature-policy.md` §4 | PASS |
| R0-06 | Late pre-detectable unsupported-operation failure is defined as a product defect | Constitution P2; feature policy §8 | PASS |
| R0-07 | One canonical action per major user intent is required | Constitution P4; feature policy §5 | PASS |
| R0-08 | Feature simplification classes A-H are defined | `feature-policy.md` §2 | PASS |
| R0-09 | R1 registry fields are defined | `feature-policy.md` §3 | PASS |
| R0-10 | Core workflow set is defined independently of current navigation | `core-workflows.md` | PASS |
| R0-11 | Top-20 discoverability set is frozen | `core-workflows.md` §4 | PASS |
| R0-12 | Top-10 no-Help usability set is frozen | `core-workflows.md` §5 | PASS |
| R0-13 | Workflow qualification evaluates Find/Understand/Execute/Recover/Export/Reopen+Validate | `ux-metrics.md` §5 | PASS |
| R0-14 | Correctly blocked unsupported workflows count as successful product behavior | `core-workflows.md` §9 | PASS |
| R0-15 | User-facing UX metrics distinguish target from measured baseline | `ux-metrics.md` §1-3 | PASS |
| R0-16 | Unmeasured UX claims are explicitly marked UNMEASURED | `ux-metrics.md` §1-2 | PASS |
| R0-17 | Tool-findability target is >=90% first-location accuracy | `ux-metrics.md` §3-4 | PASS |
| R0-18 | Supported golden-workflow target is >=98% | `ux-metrics.md` §3 | PASS |
| R0-19 | Misleading pre-detectable unsupported actions target is zero | `ux-metrics.md` §3, §6 | PASS |
| R0-20 | Output reopen/validation expectation is defined | `ux-metrics.md` §5-6 | PASS |
| R0-21 | Responsive/manual validation targets are defined | `ux-metrics.md` §8 | PASS |
| R0-22 | Evidence storage/privacy rules are defined | `ux-metrics.md` §11 | PASS |
| R0-23 | Feature removal/demotion is explicitly valid improvement work | Constitution P9; feature policy §10 | PASS |
| R0-24 | Specialist/technical features are prevented from competing with Tier-1 UI by policy | `feature-policy.md` §6 | PASS |
| R0-25 | Destructive/lossy operations require consequence disclosure | Constitution P6; `core-workflows.md` §7 | PASS |
| R0-26 | Existing automated release gates remain required but insufficient alone | Constitution §6; `ux-metrics.md` §2 | PASS |
| R0-27 | Main is explicitly the authoritative source; reconstruction uses branch -> PR -> merge | reconstruction README | PASS |
| R0-28 | Manual qualification evidence format exists | `manual-qualification-template.md` | PASS |

## 3. Baseline truthfulness gate

R0 deliberately does **not** claim that the following targets already pass:

- 90% tool-findability;
- 90% no-Help completion;
- 98% representative-workflow pass rate;
- zero late unsupported failures;
- zero workflow-blocking responsive defects.

Those values require new manual/representative evidence and remain `UNMEASURED` at R0. Any later report that upgrades them must include test evidence tied to a commit and corpus/environment identifier.

## 4. Change-boundary gate

R0 must not:

- add new PDF capability;
- change export semantics;
- reclassify existing features as reliable without evidence;
- redesign navigation before R1/R2 inventory evidence exists;
- remove existing product functionality before it has been classified under R1.

R0 documentation is therefore intentionally normative rather than behavioral.

## 5. R0 completion definition

R0 is complete when:

1. all R0 documents exist in the repository;
2. they are internally consistent;
3. R1 can inventory the complete current feature surface without needing undocumented classification rules;
4. R2 can judge proposed navigation against measurable findability criteria;
5. R3 can reconstruct workflows against the golden set;
6. R4 can implement runtime support states against one shared capability policy;
7. R8 can record manual qualification using one stable result vocabulary.

## 6. Next gate

After R0 merges, **R1 — Feature Inventory & Ruthless Simplification** must inspect the current application itself and produce the complete feature registry. No feature should be removed, promoted, or moved solely from memory or prior roadmap claims; R1 should trace the actual current UI and implementation surfaces.
