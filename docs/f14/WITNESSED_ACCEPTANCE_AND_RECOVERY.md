# F14 — Independent witnessed intake, signer custody, and physical recovery packet

## Engineering lineage

F14 is stacked directly on **qualified F13** draft PR #157, HEAD
\`6953bb082044bc96d88b530e1db0ff743b9b6d88\`. The original
source is never rewritten. The separate current F14 implementation
HEAD is recorded from GitHub's actual pull request event.

\`verify_f13_original.py\` independently calls the GitHub Actions
read-only REST API, requires exact original F13 run **38057626514**
and exact head/name/completed/success state, downloads original GitHub
artifact **11672078495** with its whole-ZIP SHA256 checked against
GitHub's own artifact digest, parses the exact two expected JSON
members and rejects altered F13 NO_GO, 0 verified signers, 9 OPEN
human requirements, and changed F12/F11 source SHAs. The verifier
then independently re-fetches and audits the original F12 artifact
and all five nested F11 artifacts, ensuring the F13 summary cannot
substitute for original bytes.

## Offline human/recovery evidence intake (disabled by default)

\`witness_intake.py\` accepts an explicitly operator-provided F13 Ed25519
trust bundle, pinned **outside** CI to an authentic offline root
public key, whole-bundle SHA256 and externally pinned predecessor
SHA256. It *never* generates production keys, chooses a trusted root,
invents witness identities, or accepts an unpinned signed bundle.

Every intake record comprises TWO separate signed envelopes:

- Authorized reviewer: requirement-specific role; source-bound
  F12 and original F13 SHA; original evidence path+SHA256; issue/expiry
  dates; unique nonce and counter.
- Independent release operator witness: separate signer and
  role; source-bound current F14 and original F13 SHA; reviewer
  envelope SHA256; the *same* evidence SHA256; unique witnessed
  session/time, nonce and counter; typed activity method.

The nine original categories each have one required activity method:
Account owner authentication; original migration/encrypted-backup
restore; D-series human image review; physical Android Chrome/Samsung
Internet; physical iOS Safari; NVDA/VoiceOver and real keyboard;
external independent PDF reader with physical print; human security
and privacy release review; physically witnessed restore/rollback.

Each record is separately verified through the F13 root-pinned trust
ledger and Ed25519 signatures. Old/revoked, improperly rotated,
role-conflicting or replayed identities fail closed. Duplicate
requirements, reused witness/reviewer, counter/nonce/session replay,
future or expired timestamps, missing/unsafe evidence paths, altered
original files, inconsistent cross-envelope hashes and differing
source commits are rejected. Unrecognized evidence methods or schema
keys are rejected rather than guessed.

**Critical distinction:** A cryptographically sound claim does not
prove that a physical device was used or that a real person witnessed
anything. This source verifier can only mark a claim as technically
eligible for independent inspection, **never as completed human
acceptance**. Only a distinct authorized physical reviewer may
accept real-world evidence in a separate operator-governed process.

## Human witness field checklist

The operators must independently obtain originals and check:

| Human requirement | External originals needed | Human independence requirement |
|---|---|---|
| F8B Account SSO | Owned account, authorized sign-in/out and isolation, written owner decision | Account owner and separate witness |
| Origin migration/backup | Original-origin protected backup, encrypted restoration, schema and rollback logs | Recovery operator plus different witness |
| D-series fidelity | Approved visual references, real render/print comparisons and written review | Human visual owner plus separate witness |
| Android browser | Physical Android hardware identifiers (redacted), Chrome and Samsung Internet versions, saved session and offline/zoom tests | Real mobile reviewer plus separate witness |
| iOS browser | Physical iPhone/iPad and Safari version, open/save/offline/print tests | Real mobile reviewer plus separate witness |
| Accessibility | Physical keyboard, NVDA and VoiceOver used by actual testers; focus, announcements, 200% zoom, reduced-motion review | Accessibility reviewer plus separate witness |
| Independent PDF/print | Real Adobe/third-party reader render, annotations, forms, actual print outputs, reader version | Independent reviewer plus separate witness |
| Privacy/security | Actual authorization/access controls and consent, threat review, explicit human security decision | Security owner plus separate witness |
| Restore/rollback | Real pre-release stable state, signed prior-stable identity, failure injection, restored hashes and exercised recovery | Recovery operator plus separate witness |

These are **collection requirements**, not claims that observations,
hardware/approvals or a rollback occurred. Store original private
source evidence exclusively in an operator-controlled system,
never in GitHub Actions public artifacts. The F14 GitHub artifact
contains only the *absence-of-approval* packet and source hashes.
Missing original witness records always produce NO_GO.

## Explicit governance

With no external root key or real evidence supplied (the normal
GitHub workflow), output must be:

- \`trustStatus: NOT_CONFIGURED\`
- \`missingHumanRequirements: [all 9]\`
- \`trustedHumanApprovalCount: 0\`
- \`actualWitnessedPhysicalApprovalsConfirmed: false\`
- \`releaseDecision: NO_GO\`
- \`authorizedToMerge: false\`
- \`authorizedToDeploy: false\`

Synthetic ephemeral test signing keys are generated **in memory only**
to exercise denial paths; never treat these as production identities.
CI does not deploy, update production settings, run original-origin
migration, merge, tag, change screenshot goldens, modify PWA caches,
publish reviewer evidence or claim performed human testing. F8B,
D-series and recovery decision owners remain independent.

## F15 — Independent witness reconciliation & owner release packet

**Not started.** Objectives:
- independently attest real physical-device/assistive-tech and
  external reader/print evidence from operators with genuine custody;
- strict anti-compromise trust bundle continuity and owner-bound
  signer rotation/revocation evidence;
- verified prior-stable rollback and encrypted-backup restore
  witnesses with independent hashes;
- separate authorized owner release versus postrelease acceptance;
- source-bound operator audit, default NO_GO until all human
  approvals actually exist.

No F14 CI result, even when green, means permission to deploy.
