# Stable Release Checklist

## Automated gates

- [ ] `npm install` succeeds from the release environment
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] GitHub Pages deployment smoke test
- [ ] Service-worker update from previous deployed build
- [ ] Version 1–4 project-package import migration
- [ ] Version 5 corruption rejection
- [ ] Storage health scan and safe repair actions

## Browser and device gates

- [ ] Chrome desktop
- [ ] Edge desktop
- [ ] Firefox desktop
- [ ] Safari desktop
- [ ] Chrome Android
- [ ] Safari iOS
- [ ] Keyboard-only navigation
- [ ] Touch page organization and editor controls
- [ ] Reduced-motion mode
- [ ] Offline opening after installation

## PDF corpus gates

- [ ] Ordinary searchable text PDFs
- [ ] Image-only scans
- [ ] CJK and Arabic documents
- [ ] Forms and duplicate field names
- [ ] Password-protected PDFs
- [ ] Digitally signed PDFs
- [ ] Optional-content layers
- [ ] Attachments and active actions
- [ ] Transparency and large images
- [ ] 500-page and 1,000-page documents
- [ ] Incrementally saved documents
- [ ] Damaged cross-reference tables
- [ ] Redaction markers in text, image, annotation, metadata, and attachments

## External application gates

- [ ] Adobe Acrobat Reader
- [ ] PDF24
- [ ] Chrome viewer
- [ ] Firefox viewer
- [ ] macOS Preview
- [ ] Representative Android PDF reader
- [ ] Representative iOS PDF reader
- [ ] Microsoft Word DOCX opening
- [ ] Printed Bates pages
- [ ] Printed booklet imposition

## Publication gate

- [ ] No critical data-loss defect
- [ ] No critical redaction or sanitization defect
- [ ] No unresolved project migration failure
- [ ] Privacy claims match observed network behavior
- [ ] Third-party notices complete
- [ ] Release notes match actual stable features
- [ ] Change channel from `release-candidate` to `stable`
