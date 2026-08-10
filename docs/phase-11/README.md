# Phase 11 — Stable Release Conversion

Phase 11 stops feature expansion and converts the broad PDF suite into a verifiable release candidate. Its purpose is to make release evidence reproducible, catch invalid package assumptions before installation, validate representative PDFs through independent readers, and make the stable tag impossible unless the official build and browser gates pass.

## Deliverables

1. Exact dependency-policy enforcement
2. Published Playwright version correction
3. Supported Node runtime floor
4. Dependency-independent semantic and runtime gate
5. Deterministic PDF validation corpus
6. PyMuPDF and pypdf validation report
7. Browser corpus tests
8. Hardened CI, deployment, and release workflows
9. Lockfile-generation workflow
10. Stable-tag requirement for a committed lockfile

## Commands

```bash
python -m pip install -r requirements-phase11.txt
npm run gate:phase11
```

The command performs:

- Dependency policy audit
- Source and privacy-policy audit
- Internal semantic/null-safety check
- Pure runtime regression
- Corpus generation
- Independent corpus validation

After official npm dependencies are installed:

```bash
npm run release:check
```

## Corpus

The generated corpus contains:

- Searchable multipage PDF with links and bookmarks
- Mixed page sizes and rotations
- Annotation types
- Interactive forms
- Korean, Chinese, Japanese, and Arabic text
- Redaction source and permanently redacted output
- AES-256 encrypted PDF
- Incrementally updated PDF
- Intentionally malformed PDF
- 200-page performance document

The generator is deterministic and redistributable. Expected structure, text markers, checksums, and security behavior are stored in `tests/corpus/generated/manifest.json`.

## Stable boundary

Phase 11 does not label the project stable merely because the dependency-independent gate passes. Stable publication requires:

- A committed npm lockfile
- Official dependency installation
- Official TypeScript declarations
- Vitest
- Real Vite production output
- Chromium, Firefox, and WebKit Playwright checks
- Deployed GitHub Pages validation
- External reader and device evidence
