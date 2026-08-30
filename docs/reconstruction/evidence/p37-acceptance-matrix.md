# P37 Acceptance Matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Mixed-selection properties use `Unified layout` instead of `P6 · Unified layout` | `tests/e2e/p6-unified-layout.spec.ts` | Automated |
| Mixed-selection explanation does not require P1–P5 writer terminology | `tests/e2e/p6-unified-layout.spec.ts` | Automated |
| Rotation guidance does not expose the P4 implementation model | `tests/e2e/p6-unified-layout.spec.ts` | Automated |
| Selection actions explain source-object restrictions directly | `src/editor/components/UnifiedLayoutPropertiesPanel.tsx` | Review |
| Existing P6 engineering browser coverage remains intact | `tests/e2e/p6-unified-layout.spec.ts` | Automated |
| Geometry/edit routing/export behavior is unchanged | Source diff limited to product copy/tests/docs | Review |

## Required gate

Before merge, the final head must pass PDF Studio CI including browser regression, Consumer performance budget, and R10 operational-readiness policy.
