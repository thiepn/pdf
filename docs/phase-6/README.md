# Phase 6 — Advanced Utilities

Phase 6 extends the local PDF suite with compression, batch processing, comparison, inspection, and repair. All workflows reuse existing local project storage, workers, cancellation, and output validation rather than creating separate document-upload services.

## Main modules

- `src/workers/processing.worker.ts` — MuPDF optimization and clean-repair operations
- `src/processing/processingClient.ts` — cancellable processing-worker client
- `src/processing/rasterCompression.ts` — PDF.js raster profiles and JPEG PDF assembly
- `src/processing/batchRepository.ts` — persistent recipe storage
- `src/views/CompressionPage.tsx`
- `src/views/BatchPage.tsx`
- `src/comparison/diff.ts`
- `src/views/ComparePage.tsx`
- `src/views/InspectorPage.tsx`
- `src/views/RepairPage.tsx`

## Preservation model

Lossless optimization and repair retain PDF structure as far as MuPDF's clean rewrite permits. Raster compression deliberately creates image-only pages and displays a warning before processing. Comparison and inspection do not alter their inputs.
