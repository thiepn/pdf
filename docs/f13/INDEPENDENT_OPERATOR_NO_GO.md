# F13 — Independent operator custody, signer lifecycle, and NO_GO

## Scope and provenance

F13 is a separate development branch stacked directly on **fully qualified F12**
draft PR #156 at exact SHA
\`8d91bcdb1b385d0ed073d13f1893555f5c4b0f69\`.
Neither F12 nor F13 is merged, deployed, published or a release approval.

\`verify_f12_original.py\` separately authenticates the actual F12 GitHub
Actions run **38039819313** against its immutable source SHA, name, completed
status and success conclusion. It downloads its original artifact
**11664918720**, validates the SHA-256 of actual artifact ZIP bytes against
GitHub's read-only authenticated artifact digest, independently checks the
inside source chain to the exact qualified F11 SHA and all five nested
original F11 ZIP artifacts, and revalidates the original F12 default-DENIED
packet, nine OPEN human requirements, and complete file-custody receipts.
No caller-supplied success or reconstructed ZIP is accepted instead.

F13's separately recorded **implementation SHA** must not be confused
with the F12 or F11 source evidence SHA. A new F13 commit requires its
own fresh CI and evidence packet. This branch creates no production
accounts, keys, operator users, migrations, secret storage or release tags.

## Trusted offline human-attestation contract

\`operator_release_evidence.py\` accepts an operator-supplied Ed25519 trust
history **only with an independent, external SHA-256 pin and an independent
offline root public key**. The root signs the canonical trust bundle. A
successor bundle requires an externally pinned predecessor digest;
missing chain state or an unpinned root is not accepted. Register/grant,
cross-signed rotation and revocation events must be ordered and typed,
with monotonic event numbers and explicit UTC timestamps. Revocation
invalidates old and compromised signer identities (including older
records), and rotation requires an active preceding signer signature
plus the root-signed trust history. There is no CI/ChatGPT-generated
production signer or root key.

Attestation records are separately Ed25519-signed by their authorized
role holders and cryptographically bound to exact F12 **and** current
F13 commits, a SHA-256-verified original evidence file, issue/expiry
times, unique anti-replay nonce and monotonic per-signer counter. The
required role/physical-evidence categories are:

1. Account owner: F8B SSO owner authorization
2. Recovery operator: original-origin schema and encrypted off-device backup
3. Visual owner: D-series reference/image/fidelity acceptance
4. Physical mobile tester: Android Chrome and Samsung Internet
5. Physical mobile tester: iOS Safari
6. Accessibility reviewer: NVDA/VoiceOver, keyboard and real assistive devices
7. Independent reader reviewer: Adobe/third-party PDF and print hardware
8. Security reviewer: human security, privacy and release authorization
9. Recovery operator: physical rollback and disaster recovery drill

Human evidence files and identities are **not supplied** in F13.
The workflow deliberately does not set a signing key, root trust
material or attestations. The expected result is therefore
\`operatorTrust: NOT_CONFIGURED\`, all nine human requirements OPEN,
\`humanPhysicalAcceptance: OPEN\`, \`releaseDecision: NO_GO\`, and
\`authorizedToMerge: false\` / \`authorizedToDeploy: false\`.
Synthetically passing tests only verify negative contracts: they
are never human signoffs.

Even independently pinned signatures merely make an intake record
eligible for separate operator examination, not certify that a
physical test, witnessed rollback or privacy review actually happened.
A GO cannot be returned by this parser or triggered by any CI step.
Only separately authorized future operator infrastructure may
implement a release action, and its authorization is outside F13.

## Review blockers carried forward

F8B production Account acceptance, original-origin migration and
encrypted backup restore, D-series human visual decisions, real Android
and iOS browser sessions, NVDA/VoiceOver physical accessibility,
independent PDF app/print review, security/privacy owners and operator
rollback drill are **OPEN**. No physical device, human reviewer, paid
service, account or signer has been fabricated.

No screenshot baselines were changed; no CI checks were weakened.
GitHub PR must stay DRAFT and the release default remains NO_GO.

## F14 — Independent witnessed human-intake & recovery drill certification

**Status: Not started.** Next objectives:
- owner-controlled real-human/real-device acceptance intake with independent
  provenance, reviewer identities, consent and revocation semantics;
- offline trust-root custody and uncompromised signer rotation exercised
  by authorized operators, not synthetic fixture keys;
- witnessed accessibility/mobile/third-party-reader and offline backup
  restore/rollback exercises with independent operator signoff;
- tamper-evident GO/NO_GO decision packet and explicit no-deploy default;
- exact-head CI and external evidence audit, preserving separate F8B/D
  signoffs and human release authorization.

Passing F13 does not approve the F14 release.
