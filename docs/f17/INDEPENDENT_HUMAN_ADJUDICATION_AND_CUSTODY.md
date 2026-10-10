# F17 — Independent human identity adjudication, previous-stable custody, NO_GO

## Actual stacked source, not a release

F17 branches **separately** from F16 draft PR #160, exact qualified
\`cf2eca998ddb5807a9829d415092bdfe0cb5bb18\`. F16 qualified with
a dedicated 22-test operator/recovery gate, R10, performance, full
validation and **563 passing Chromium/Firefox/WebKit browser regressions**.
Do not merge or deploy F16 or F17; all earlier F11–F16 draft ancestry stays.

\`verify_f16_original.py\` uses only the read-only GitHub Actions API to
verify the **original** exact F16 run \`38065225079\`, original artifact
\`11674672717\`, its original whole-ZIP SHA-256 versus authenticated
GitHub artifact metadata, its two exact original source/NO_GO reports,
and the asserted original F15/F14/F13/F12/F11 commit and artifact IDs.
It **independently re-fetches and validates** all original ancestor
archives instead of trusting copied source-report statements. Current
F17 implementation SHA remains distinct from every original source SHA.

## Operator identity root and compromise handling

F17 extends the F13/F14/F15/F16 offline, externally pinned Ed25519
signer-trust history and independent original evidence receipts with a
root-signed identity registry:

- operator must supply an independently governed root public key;
- original trust bundle SHA256 and previous trust digest are pinned off-CI;
- original identity register SHA256 and predecessor digest are pinned
  separately off-CI; no self-certification;
- schema, source SHA, UTC expiry, monotonic registry sequence, root
  signature, unique signer IDs and unique separately identified person
  IDs must be authenticated;
- each identity's original evidence bytes are independently SHA256
  verified and signer public-key fingerprints/roles must match the
  rooted signer trust;
- revocation, key replacement and compromised identities must remain
  invalid. Root signatures cannot reactivate revoked keys.

**A valid signature or person ID is not proof a real person appeared.**
Actual identity, right-to-review and consent/revocation records must be
adjudicated by a separate authorized person outside GitHub and this
script. CI never provisions real signers, owners, identity proofs,
physical evidence, accounts or private production originals.

## Separate review roles and postrelease containment

Five separately signed and segregated review *claims* are supported:
owner pre-cutover, independent security, independent accessibility,
independent recovery, and separate postrelease review. Each requires an
active authorized signer and a distinct rooted person ID; signed
original F16 and current F17 SHA; original evidence-manifest SHA256;
phase, timestamps, nonce and counter; and the ONLY permitted disposition
\`REVIEWED_NOT_AUTHORIZED\`.

The postrelease review cannot masquerade as a precutover decision.
It requires a separate original external deployment-receipt digest.
An externally signed claim is only **cryptographic custody** and can
never automatically authorize GO, migration, deployment, rollback or
closure. Postrelease closure remains OPEN until independent operator
and owner release custody actually exists.

Original F14 reviewer/witness receipt pairs are verified against the
**original F14 SHA** and actual bytes by F14's signature and evidence
checker, not rewritten with F17's SHA. F16 retains externally pinned
previous-stable and encrypted-backup SHA256 verification, separately
named original evidence files, distinguishable restore/rollback logs,
and independent original restoration/rollback observation signers.
F17 carries their lineage and opens adjudication preparation, not
genuine recovery certification.

## Nine human acceptance boundaries stay OPEN

The original requirements are F8B Account authorization; original-origin
schema migration and encrypted off-device backup restore; D-series
approved visual references and fidelity; real Android Chrome/Samsung
Internet; real iOS Safari; NVDA/VoiceOver and keyboard; independent
Adobe/third-party PDF and physical printing; privacy/security/release
decision; and authentic prior-stable rollback/recovery operators.

No human input is provided in the normal F17 CI. Even if valid
**synthetic test signatures** can demonstrate protocol correctness,
all nine real-world acceptance requirements remain OPEN; F17 deliberately
returns \`realHumanIdentityAdjudicated:false\`,
\`actualPhysicalTestsConfirmed:false\`, \`ownerGOAuthorized:false\`,
\`postreleaseClosureAccepted:false\`, \`releaseDecision:NO_GO\`,
\`authorizedToMerge:false\`, and \`authorizedToDeploy:false\`.

## External custody and privacy boundary

Actual device recordings, personal identity materials, consent,
accessibility clips, original backups, key material and source-rights
documents must remain in separately authorized off-Git custody.
The GitHub workflow outputs only immutable commit identities, hashes,
absence-of-evidence indicators and the **NO_GO** gate packet.
Do not upload real private human source evidence as ordinary CI
artifacts. The code has no production authentication, migration,
publishing, merge, rollback execution, or screenshot-golden update.

## F18 — Independently Governed Human Release Readiness & Recovery Witness Handoff

**Status:** Not started.

Objectives: real independently verified owner and review identities,
genuine documented consent and revocation, original physical Android,
iOS, NVDA, VoiceOver, external reader/print witness review, governed
prior-stable encrypted-backup restoration proof, off-Git archival
custody/replay and independent signer trust-root continuity. Preserve
distinct owner, operator and postrelease GO/NO_GO rights, with
\`NO_GO\` default until real source evidence and human signoff exist.
