# F12 — Independently authenticated evidence custody & denied human release

This is a **non-deploying, non-approving** phase, stacked on qualified F11
[draft PR #155](https://github.com/thiepn/pdf/pull/155), exact head
\`ab21d2d6e09033737d76867606454ba8f672c79f\`. F12 CI passing is
NOT authorization to merge, tag, migrate, expose user data or deploy.

## Two independent claims and strict source binding

1. **Verified GitHub origin.** \`verify_github_evidence.py\` calls the read-only
   GitHub Actions API for four *original F11-head* workflow run IDs: full CI
   \`38035348951\`, independent F11 \`38035348922\`, performance
   \`38035348962\`, and R10 policy \`38035348923\`. It requires exact F11
   source SHA, matching names, completed state and successful conclusions;
   caller-supplied claims cannot replace these network observations.
2. **Actual original artifact bytes.** It independently enumerates the required
   artifacts from these specific runs, downloads their original ZIP bytes
   without forwarding the GitHub token to the signed storage redirect, and
   compares whole-ZIP SHA-256 with the authenticated GitHub artifact digest.
   It validates ZIP members, forbids path escapes/duplicates, and checks the
   independent F11 report identifies precisely 21 original browser-produced
   PDFs across Chromium, Firefox and WebKit, with 7 passing cases each.

The output provenance binds **two different commits**: the exact qualified
F11 *evidence source* commit and the F12 *current implementation* commit. Do
not pretend that F11 workflows ran on the distinct F12 implementation head.
Each review packet includes immutable run/artifact IDs, original ZIP digests,
their members' SHA-256 values and an F12-head audit identity.

After authenticating GitHub source bytes, \`reconcile_acceptance.py\` hashes
the downloaded custody ZIP files and records file lengths/paths in a
portable inspection packet. It rejects changed bytes, missing or extra files,
symlinks, traversal, duplicates, stale/failed runs and malformed records.
The separate CI test suite injects adversarial inputs to verify these checks.

The GitHub token is the ephemeral, read-only Actions token; no release keys,
operator signing keys, production credentials or production database access
are requested or assumed. Failure to access GitHub or obtain an original
artifact digest is a blocking failure, **never** permission to continue.

## Human obligations, deliberately OPEN

- F8B Account SSO and explicit owner authorization
- Original-origin schema migration and encrypted off-device backup recovery
- D-series image/visual fidelity and actual human reference acceptance
- Physical Android Chrome and Samsung Internet
- Physical iOS Safari
- Real keyboard, NVDA/VoiceOver accessibility
- Independent Adobe/third-party reader and physical print interoperability
- Human security/privacy and separate merge/deploy/publication decisions
- Reversible rollback and disaster recovery operator acceptance

All nine categories are emitted with \`status: OPEN\` and
\`attestation: null\`; the preparation report is always
\`releaseDecision: DENIED\` and \`authorizedToDeploy: false\`.
No self-asserted approval or arbitrary text is accepted as owner authority.
Genuine signer trust/rotation/revocation and physical witnessed custody
remain distinct future operator-only work.

## F13 — Independent operator acceptance & controlled release decision

**Not started.** Objectives: separate owner/operator decision custody,
independent trust roots with authorized signer rotation/revocation,
real-device/assistive-tech and rollback acceptance, and explicit audit-ready
GO/NO-GO determination. Default remains NO-GO until originals and human
signoffs exist; no CI workflow can turn synthetic or missing acceptance
into authorization.
