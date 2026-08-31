# P43 Acceptance Matrix

| ID | Requirement | Automated enforcement | Current state |
| --- | --- | --- | --- |
| P43-HUMAN-01 | Full R9 usability sessions run on physical hardware only | schema-3 validator rejects simulator/emulator/automation evidence | UNMEASURED |
| P43-HUMAN-02 | At least 3 distinct human testers | R9 summary/certifier | UNMEASURED |
| P43-HUMAN-03 | At least 2 testers have none/light familiarity | R9 summary/certifier | UNMEASURED |
| P43-HUMAN-04 | Every session and aggregate meet >=90% first-location, no-Help completion, and navigation-prediction targets | R9 summary/certifier | UNMEASURED |
| P43-DEVICE-01 | Windows desktop/laptop + Chromium physical-device slot | real-device validator | UNMEASURED |
| P43-DEVICE-02 | macOS desktop/laptop + Safari physical-device slot | real-device validator | UNMEASURED |
| P43-DEVICE-03 | Android phone + Chromium physical-device slot | real-device validator | UNMEASURED |
| P43-DEVICE-04 | iPhone/iOS + Safari physical-device slot | real-device validator | UNMEASURED |
| P43-DEVICE-05 | iPadOS tablet + Safari physical-device slot | real-device validator | UNMEASURED |
| P43-JOURNEY-01 | J01–J10 each have qualifying physical-device coverage | real-device validator | UNMEASURED |
| P43-PWA-01 | At least one installed-PWA run qualifies J10 recovery/offline reopening | real-device validator | UNMEASURED |
| P43-SAFE-01 | Critical or data-loss defect blocks certification | human and device validators/certifier | ENFORCED |
| P43-PRIVACY-01 | No passwords, private filenames/content, screenshots, PII, device serials | recursive privacy validators | ENFORCED |
| P43-INTEGRITY-01 | Certification hashes every human session and device run | R9 certifier | ENFORCED |
| P43-INTEGRITY-02 | R10 requires underlying evidence files and verifies every digest | R10 gate | ENFORCED |
| P43-STATUS-01 | Repository status must match actual evidence directories | P43 status contract | ENFORCED |
| P43-BASELINE-01 | Human/device qualification uses exact P42 product baseline `be223e37…` | validators + qualification-baseline manifest | ENFORCED |
| P43-GOV-01 | Current R10 operational baseline is not promoted before human/device certification | R10 baseline policy | ENFORCED |
| P43-AUTO-01 | CI/browser automation cannot count as human or physical-device evidence | explicit metadata/attestation and marker rejection | ENFORCED |
| P43-REG-01 | R9/P43/R10 contract unit tests pass | PDF Studio CI / R10 workflow | PENDING CI |
| P43-REG-02 | Full existing release and exact-dist browser regression remains green | PDF Studio CI | PENDING CI |
| P43-PERF-01 | Consumer performance budget remains green | Consumer performance workflow | PENDING CI |

## Interpretation

`ENFORCED` means the P43 framework has an automated fail-closed rule. It does **not** mean a real human/device observation has been performed.

`UNMEASURED` is the required current state until actual physical-device evidence is committed.
