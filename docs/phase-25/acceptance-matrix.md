# Phase 25 Acceptance Matrix

| Requirement | Evidence | Status |
|---|---|---|
| Markdown block parsing | `creator/markdown.ts` + unit/runtime tests | PASS |
| Plain-text creation | creator parser + Create PDF Studio | PASS |
| Semantic HTML import | `creator/htmlImport.ts` | PASS |
| A4/A5/custom metric geometry | `creator/layout.ts` | PASS |
| Configurable margins/typography/running content | Create PDF Studio | PASS |
| Reusable local style presets | `creator/presets.ts` | PASS |
| Searchable PDF worker | `workers/creator.worker.ts` | PASS |
| CJK searchable font path | MuPDF CJK font resource path | PASS |
| Unsafe shaping-dependent scripts blocked from searchable mode | creator worker | PASS |
| Browser-shaped visual compatibility output | `creator/rasterPdf.ts` | PASS |
| Created output can become a normal local project | Create PDF Studio | PASS |
| Inserted/deleted page sequence alignment | `comparison/alignment.ts` | PASS |
| Aligned rows drive visual/text pair comparison | Compare 2.0 UI | PASS |
| Batch recipe JSON export/import | Batch page/model | PASS |
| Imported recipe schema validation | `parseBatchRecipeJson` | PASS |
| Phase 25 dependency-independent regression | 12/12 | PASS |
| Official lockfile-derived browser/build gate | GitHub CI | PENDING ENVIRONMENT |
