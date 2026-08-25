# R10 — Operational Readiness, Maintenance & Long-Term Support Gate

## 1. Purpose

R10 establishes the post-release operating contract for PDF Studio after the R8 reconstruction freeze and the R9 human-usability qualification framework.

R10 is **not** a feature phase. It exists to keep the frozen product safe, reproducible, supportable, and auditable when maintenance becomes necessary.

R10 starts from the merged R9 tooling baseline:

`4f3f0c05fa231f8e7908ed298675142e35ea2103`

The currently frozen product baseline remains the R8 product commit:

`7c81f95815a3d8740fddef3d76e264ebb19c96f8`

until a qualified maintenance release explicitly replaces it.

## 2. R9 dependency

R10 tooling may be implemented before human R9 sessions exist, but final operational certification may not bypass R9.

`R10_OPERATIONAL_READY` requires a valid R9 certification record whose:

- `status` is `R9_HUMAN_USABILITY_CERTIFIED`;
- `human_ux_status` is `HUMAN_UX_TARGET_MET`;
- `product_baseline_commit` matches the currently qualified product baseline;
- evidence digests remain present in the certification record.

Without that record the correct R10 state is `R10_BLOCKED_BY_R9`.

## 3. Maintenance classes

Every post-freeze change belongs to exactly one class.

| Class | Intended use | Minimum engineering consequence |
| --- | --- | --- |
| `documentation-tooling` | docs, qualification scripts, non-product CI/tooling | no product requalification unless product behavior is touched |
| `dependency-toolchain` | dependency, compiler, browser/runtime or build-tool maintenance | full engineering/reproducibility gate |
| `compatibility-repair` | browser/PDF compatibility regression repair | full engineering gate; affected human workflows must be reconsidered |
| `product-hotfix` | narrowly scoped user-facing defect correction | full engineering gate and affected R9 workflow requalification |
| `security-privacy-data-loss-emergency` | urgent security, privacy, corruption or data-loss repair | security/privacy gate + full engineering gate + affected human requalification |

Feature expansion is outside R10. It requires an explicitly new product-development phase rather than being disguised as maintenance.

## 4. Required change record

Every change after the frozen product baseline must have a machine-readable maintenance record under:

`docs/reconstruction/evidence/r10/maintenance/`

Use `r10-maintenance-record-template.json`.

A record identifies:

- change ID and class;
- exact base and target commit;
- whether product behavior changed;
- risk and security/privacy/data-loss flags;
- reason and rollback commit;
- required qualification gates;
- actual gate outcomes;
- current maintenance status.

A maintenance record is evidence. It must never contain document contents, passwords, secrets, private filenames, account identifiers, or other user data.

## 5. Gate policy

### 5.1 Documentation/tooling

If no product behavior changes, the R8/R9 product qualification may remain valid. CI/tests for the changed tooling still have to pass.

### 5.2 Dependency/toolchain maintenance

Dependency or build-tool changes require the full engineering/reproducibility chain because they can alter runtime behavior even without source-code changes.

If observable product behavior changes, affected R9 human workflows must be rerun.

### 5.3 Compatibility repair

Compatibility fixes require:

1. a recorded real regression or reproducible compatibility defect;
2. a narrowly scoped repair;
3. full R8-equivalent engineering qualification on the corrected exact head;
4. renewed R9 evidence for affected user workflows when user-facing behavior changed.

### 5.4 Product hotfix

A hotfix must be narrower than a normal feature release. It requires:

1. exact defect record;
2. exact rollback commit;
3. full engineering qualification;
4. renewed human qualification for affected workflows;
5. no unrelated feature work.

### 5.5 Security/privacy/data-loss emergency

Emergency changes may be prioritized for safety, but they do not receive weaker evidence requirements. Before a corrected release is promoted it must pass the required security/privacy, engineering, and affected-human gates.

An unresolved critical, data-loss, security, or privacy maintenance record blocks R10 operational certification.

## 6. Rollback contract

Every product-affecting maintenance record must identify a known-good rollback commit.

Rollback is preferred over speculative forward-fixing when:

- corruption or data loss is possible;
- a security/privacy regression is suspected;
- the current exact head cannot be reproduced or qualified;
- the regression scope is not yet understood.

A rollback itself must be recorded so release lineage remains explicit.

## 7. Long-term dependency policy

Dependencies are not updated merely because a newer version exists.

A dependency/toolchain update should have at least one concrete reason:

- supported-platform compatibility;
- security remediation;
- reproducibility/toolchain support;
- removal of an unsupported dependency;
- a confirmed defect fixed upstream.

Major dependency upgrades are treated as higher-risk maintenance and must not be bundled with unrelated product work.

## 8. Compatibility-regression intake

A compatibility report should record only non-sensitive metadata needed to reproduce the issue:

- browser/runtime and version;
- operating system/device category;
- synthetic/public corpus fixture when possible;
- affected workflow;
- expected result;
- observed non-sensitive defect description.

Private document contents must not be committed as regression evidence.

## 9. R10 status vocabulary

- `R10_BLOCKED_BY_R9` — valid R9 human certification is absent or does not match the qualified product baseline.
- `R10_BLOCKED_BY_POLICY` — a maintenance record violates required gate/lineage policy.
- `R10_BLOCKED_BY_CRITICAL_MAINTENANCE` — an unresolved critical, security/privacy, or data-loss maintenance condition exists.
- `R10_OPERATIONAL_READY` — R9 is certified, maintenance evidence is policy-valid, no blocking maintenance condition exists, and operational lineage is auditable.

Only `R10_OPERATIONAL_READY` closes R10.

## 10. Foundation acceptance criteria

The R10 foundation is ready when:

- maintenance classes and rollback rules are frozen;
- a maintenance record schema/template exists;
- change-policy validation is automated and tested;
- the R10 gate validates R9 dependency and maintenance records;
- CI proves the gate correctly remains `R10_BLOCKED_BY_R9` while real R9 certification is absent;
- no R10 foundation change alters PDF Studio product behavior.

R10 itself remains open until real R9 certification exists and the final R10 gate returns `R10_OPERATIONAL_READY`.