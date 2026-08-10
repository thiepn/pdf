# Phase 5 — OCR and Scanning

Phase 5 adds local OCR and image-based document creation. PDF pages are rendered to images through PDF.js because Tesseract.js recognizes images rather than PDF files directly. Recognition results are persisted page by page, allowing an interrupted job to resume without repeating completed pages.

## Main modules

- `src/ocr/ocrClient.ts` — Tesseract worker lifecycle and output normalization
- `src/ocr/languagePackManager.ts` — explicit language installation and Cache API storage
- `src/ocr/ocrRepository.ts` — OCR job/page persistence
- `src/ocr/preprocess.ts` — image preprocessing
- `src/ocr/renderPage.ts` — PDF page rendering for OCR
- `src/views/OcrPage.tsx` — resumable project OCR workflow
- `src/views/ScanPage.tsx` — image/camera scan workflow
- `src/pdf/jpegPdf.ts` — image-only PDF generation
- `scripts/copy-ocr-assets.mjs` — local worker/core deployment assets

## Data model

OCR jobs and page results are versioned independently. Completed pages may contain recognized text, confidence, word boxes, TSV, hOCR, and a searchable single-page PDF buffer. Project package format 4 can carry those buffers across browsers.

## Safety and privacy

Tesseract executable assets are served from the application. Language packs are downloaded only after an explicit user action or imported from local storage. Document images and recognition output remain inside the browser.
