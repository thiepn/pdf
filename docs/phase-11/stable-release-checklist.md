# Stable 2.0 Release Checklist

A stable tag is prohibited until every required item is complete.

## Reproducibility

- [ ] `package-lock.json` generated from official npm registry
- [ ] `npm ci` succeeds from a clean checkout
- [ ] Source archive reproduces the distribution
- [ ] Distribution integrity manifest matches files

## Official web stack

- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build:verified`
- [ ] `npm run test:e2e`
- [ ] Chromium passes
- [ ] Firefox passes
- [ ] WebKit passes

## Deployment

- [ ] GitHub Pages deploys under repository subpath
- [ ] Service worker activates and updates
- [ ] `#/validation` has no required failures
- [ ] Validation report archived with release evidence

## PDF compatibility

- [ ] Adobe Reader matrix
- [ ] PDF24 matrix
- [ ] Edge matrix
- [ ] macOS Preview matrix
- [ ] Android matrix
- [ ] iOS matrix
- [ ] Print output matrix

## Security

- [ ] Redaction adversarial recovery attempts fail
- [ ] Passwords absent from storage, backups, logs, and support bundles
- [ ] Active content sanitizer verified
- [ ] Project package path traversal and oversized input tests
- [ ] Production dependency audit has no high vulnerabilities

## Performance and recovery

- [ ] 1,000-page browser test
- [ ] Large image document test
- [ ] Ten open/close memory cycles
- [ ] Interrupted save recovery
- [ ] Interrupted OCR recovery
- [ ] Storage quota exhaustion behavior

## Release decision

- [ ] Version changed from release candidate to `2.0.0`
- [ ] Channel changed to `stable`
- [ ] Changelog finalized
- [ ] Release notes cite exact evidence
