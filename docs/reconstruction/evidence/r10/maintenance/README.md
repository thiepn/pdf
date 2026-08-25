# R10 Maintenance Evidence

Store one privacy-safe JSON record per actual post-freeze maintenance change in this directory.

Use:

`docs/reconstruction/r10-maintenance-record-template.json`

Recommended filename:

`R10-MAINT-YYYYMMDD-NN.json`

## Rules

- One record represents one narrowly scoped maintenance change.
- Do not combine unrelated fixes into one record.
- `base_commit`, `target_commit`, and `rollback_commit` must be exact Git commit SHAs/refs captured for the real change.
- Required gates must match the change class; `r10_change_policy.mjs` enforces this.
- A record may use `qualified` only when every required gate actually passed.
- Product-affecting changes must list the affected human workflows.
- Security/privacy or data-loss risk uses the emergency maintenance class.

## Privacy

Do not commit passwords, tokens, document contents, OCR output, screenshots of private documents, private filenames, names, emails, or other user data as maintenance evidence.

Use synthetic/public corpus fixtures whenever a reproducible document is needed.

## Validation

Validate one or more records with:

```bash
node scripts/reconstruction/r10_change_policy.mjs docs/reconstruction/evidence/r10/maintenance/<record>.json
```

The aggregate operational state is evaluated with:

```bash
node scripts/reconstruction/r10_gate.mjs
```

For a release/operational promotion, require:

```bash
node scripts/reconstruction/r10_gate.mjs --require-ready
```

That command must fail until genuine R9 human certification exists and all R10 policy conditions are satisfied.
