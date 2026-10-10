# F16 — Independent operator authority, genuine-witness intake and recovery readiness

## Qualified source, exact-head evidence custody

F16 is a separate stacked **draft** from F15 PR #159 at qualified SHA
\`6952cb6d0c210c0a910bfc06accefc778f68f44d\`.
F15's original read-only GitHub workflows all passed, including 23
adversarial tests, R10, performance and full PDF Studio CI with 563
Chromium/Firefox/WebKit tests. This is engineering qualification only;
not approval to merge, release, migrate, publish or access production.

\`verify_f15_original.py\` independently reads the **original F15
workflow run 38062370006**, requiring its exact ID, name, source SHA,
completed state and successful conclusion. It obtains **original
artifact 11673996595**, authenticates its whole-ZIP SHA256 against the
GitHub Actions artifact API's digest and rejects unknown, absent or
duplicate ZIP members. Original F15 NO_GO, nine uncollected human
requirements and all ancestor source identities are verified byte-wise.
It independently calls the inherited original F14 evidence verifier,
which in turn revalidates F13/F12/F11 custody. The source SHA for each
ancestor is kept separate from the current F16 implementation HEAD.

GitHub tokens are strictly Actions-read-only. Signed artifact blob
redirects do not receive the GitHub bearer token. Nothing accesses
production accounts, private backup originals or external operator keys.

## Real operator and witnessed physical-device intake contracts

\`independent_release_readiness.py\` requires the same separately
governed F13 offline Ed25519 root-pinned trust history as F14/F15.
Externally supplied **root public key, entire trust-bundle SHA256 and
predecessor digest** are all mandatory; no root or signer keys are
generated for production. The root signature binds the ordered
grant/rotation/revocation log; rotation requires an active prior signer,
cross-signature and rooted trust continuity, while revocation invalidates
a signer. No generic text or GitHub workflow output is accepted as a
real-world witness.

Reviewers must submit the nine original F14 external original-evidence
claims: F8B Account, original-origin/encrypted-backup restoration,
D-series visual fidelity, actual Android Chrome/Samsung Internet,
actual iOS Safari, keyboard/NVDA/VoiceOver, independent PDF reader and
physical printing, privacy/source rights, and real rollback drills.
Each witness must be a separate authorized operator with independently
signed source- and evidence-byte-bound receipts. The F14 verifier
enforces strict role separation, trust lifecycle, chronology, nonce,
signer counter, signed reviewer-envelope hash, evidence bytes and exact
source SHA. An accepted signature **does not itself prove human
participation, physical hardware or an actual restore**.

Owner release review, independent operator evidence acknowledgment and
postrelease closure are three distinct F15 reviews. Their separate,
role-bound Ed25519 signatures refer to the immutable qualified F15
source SHA; they are **review requests**, not permission to deploy or
close a release. F16 preserves that separation.

## Independent prior-stable restore and encrypted backup

Nine original material evidence objects must exist, each with safe file
paths and SHA256. The source of authority for previous-stable bytes and
encrypted-backup ciphertext is **two independent external digest pins**,
never the manifest being examined. Prior-stable and restored bytes
must match each other and the previous-stable external pin. Encrypted
backup bytes must match their distinct external pin. Physical restoration
is still unproven by file equality alone.

In addition, F16 requires separate Ed25519-signed source- and hash-bound
**restoration and rollback observation records**, from distinct
authorized recovery signers, with issued/expiry timestamps, nonces and
monotonic counter semantics. The records are restricted to
\`OBSERVATION_ONLY\`; commands such as deploy, restore or rollback are
never executed. Compromised signers, duplicated sessions, changed
transcripts, stale SHA or missing external pins fail closed.

Real-world original backups, visual approvals, hardware test devices,
signing keys, operators and disaster recovery drill transcripts have
not been supplied. F16 cannot and does not fabricate them.

## Safety: exact default outcome

With no independent external human trust inputs (normal F16 CI):
- \`operatorTrust: NOT_CONFIGURED\`
- all **nine** physical/Account/D-series/privacy/recovery approvals OPEN
- zero independently signed claims and zero recovery ceremonies
- \`originalHumanPhysicalAcceptance: false\`
- \`originalRecoveryBytesVerified: false\`
- \`ownerReleaseAuthorized: false\`
- \`separatePostreleaseClosureAccepted: false\`
- \`releaseDecision: NO_GO\`
- \`authorizedToMerge: false\`, \`authorizedToDeploy: false\`

**Even when all cryptographic and file-hash contracts pass**, a distinct
human release authority must independently inspect the real people,
device sessions, restoration drills, rights approvals, and security
evidence. This code has no route to return GO or to perform a release.

### F17 — Independent human acceptance adjudication and previous-stable custody

**Status: Not started.** Planned objectives: authentic external
owner/reviewer adjudication and revocation; separately witnessed actual
Android/iOS/assistive-tech/third-party-reader+printer test evidence;
external original-encrypted-backup/previous-stable restoration hashes;
independent operator incident, rollback and postrelease custody; and an
auditable default NO_GO release packet until authorized real-world
approvals exist.

No F16 success waives F8B, D-series, hardware, human security or
encrypted backup recovery blockers. Never merge, deploy, alter screenshot
goldens or migrate production on the basis of synthetic CI evidence.
