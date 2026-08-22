# R1 Pull Request Notes

R1 is a feature-exposure and product-simplification phase, not a PDF-engine feature phase.

Review focus:

- `feature-registry.csv` is the authoritative 134-capability inventory.
- `r1-feature-inventory.md` documents source-backed findings.
- `r1-duplicate-map.md` freezes canonicalization targets.
- `r1-simplification-decisions.md` freezes keep/repair/merge/demote/hide/remove decisions.
- The code diff removes obvious technical clutter from Home, Support navigation, PDF Tools, and command search.
- No PDF processing engine, project format, database schema, worker protocol, export pipeline, or persistence model is changed.
- Full task-oriented navigation remains R2 scope.
