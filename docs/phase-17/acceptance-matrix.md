# Phase 17 acceptance matrix

| Gate | Expected evidence |
|---|---|
| Unified editor navigation | Advanced workspace exposes one `Edit` mode; legacy `native` route redirects to it |
| Existing-content inspection | Text, images, simple vectors, detected tables, and AcroForm widgets are surfaced on the Edit canvas with non-zero page-origin normalization |
| Capability transparency | Every detected object has a capability level, confidence, reason, preservation list, and risk list |
| Latin text | Fixed-box replacement reconstructs static text and reopens with replacement extractable |
| CJK text | Korean/Japanese/Simplified Chinese/Traditional Chinese can use a CID font or imported compatible font |
| Complex scripts | No claim of static shaping; explicitly appearance-only fallback |
| Images | Replacement supports contain, cover, stretch and destination geometry while permanent removal stays anchored to the original detected source bounds |
| Vectors | Supported simple paths can restyle, transform or delete using corrected Fitz ↔ PDF coordinate conversion |
| Tables | Detected Latin/CJK cells can be edited as an atomic object-level batch; complex-script static reconstruction is explicitly blocked |
| Forms | Supported AcroForm value edits use the widget API and retain interactivity |
| Export | Existing-content edits run before overlay compilation; final PDF is reopened and validated |
| Phase 16 regression | Checkpoint isolation, project ownership, revisions, transactions, OCR recipes, compare, preservation remain green |
| Browser suite | Chromium/Firefox/WebKit Playwright execution required for stable designation |
