# F4 — Structure-preserving smart PDF optimizer

## What ships

F4 is integrated into the existing **Compress PDF** workspace as the default **Smart · preserve everything** mode, next to legacy lossless cleanup and explicitly destructive raster/JPEG profiles. It does not replace the latter profiles.

The file-first **Compress PDF** quick workflow also exposes Smart alongside legacy lossless and raster choices. Its default remains the existing lossless workflow for compatibility, while a separate **Smart cleanup strength** control lets users select either structural profile. A searchable **Smart PDF optimizer** task leads users to the full saved-project workspace.

The two optimization strengths are:

- **Safe structural cleanup**: one non-raster MuPDF rewrite with `garbage=2,compress=yes,compress-images=yes,compress-fonts=yes,encrypt=keep`.
- **Maximum verified cleanup**: tries the above candidate plus a second rewrite using `garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,encrypt=keep`.

For each candidate smaller than the original, the worker reopens the resulting PDF and compares all **15 structural fingerprint categories** before allowing the bytes to be returned:

1. Pages and geometry; 2. extracted text; 3. images; 4. vectors; 5. fonts; 6. annotations; 7. forms; 8. links; 9. bookmarks; 10. attachments; 11. layers; 12. metadata; 13. signatures; 14. tags; 15. encryption.

A candidate is rejected if any strict preservation category changes. The smallest safe candidate wins. If all candidates are larger or fail, **the exact original bytes are returned**, with a clear explanation and zero claimed savings. There is no lossy optimization, silent flattening or unverified page-only certification in Smart mode.

Candidates use a bounded list (1 or 2) and a cancellable worker. No incremental saving; both candidates are full rewrites, subject to F1 restrictions.

## Fail-closed inputs

Smart mode rejects before rewrite:
- Encrypted sources (regardless of supplied open password).
- Signed or certified sources (AcroForm signature widgets, `/ByteRange`, `/Perms`).
- Repaired/malformed sources.
- Multi-revision PDFs (cannot promise cryptographic revision-chain preservation).

These sources may still be opened in the existing viewer or handled by separate workflows with appropriate warnings; Smart mode refuses to make unsafe claims.

## Preservation limits

The F4 contract proves what the existing graph scanner can observe. It fingerprints semantic content, decoded images, page operators, annotation values, catalog structures and embedded attachments. It **cannot prove pixel-perfect visual identity for every renderer**, byte-for-byte preservation of original object streams, or cryptographic integrity of opaque vendor extensions. A valid but unrecognized feature may still need external-reader testing. This is **not** a PDF/A compliance or signing tool.

The existing **Keep text and forms** legacy mode and image-based profiles remain separate. The smart mode never enables metadata removal; intentional metadata stripping contradicts all-category preservation.

## Test matrix

- [x] F4 model/preservation policy/size-selection unit coverage
- [x] Dedicated CI typecheck, Vitest, production build, Playwright workflow added
- [ ] CI validated browser round trip for a real source PDF
- [ ] General application CI, performance budget
- [ ] External Adobe, Firefox, Chrome, Preview PDF reader audits for varied encrypted/signed/interactive/tagged corpus
- [ ] Stress-testing on PDF files with unusual resource dictionaries and large page counts

## Operational details

The processing result reports candidate rejections and reason for retaining original bytes. Optimizer output is always a separate derived document or downloadable file; source projects are not overwritten. No output is ready for download until the existing PDF.js reopen and page-count check has also passed. App-wide P8 structure-preservation contracts remain unchanged.
