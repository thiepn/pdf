# P45 Acceptance Matrix

| ID | Requirement | Acceptance |
| --- | --- | --- |
| P45-HOST-01 | Exact qualification product | HTTPS field host serves consumer baseline `be223e37...` only. |
| P45-HOST-02 | Stable-root preservation | Deployment refuses unless rebuilt v7.0.0 Stable `release-integrity.json` matches the live root byte-for-byte before overlay. |
| P45-HOST-03 | Isolated PWA scope | Qualification build uses `/pdf/qualification/p42/` as its build/service-worker scope and separate scope-token caches. |
| P45-HOST-04 | Post-deploy root proof | Smoke check proves Stable root integrity hash is unchanged after qualification overlay deployment. |
| P45-HOST-05 | Qualification smoke | Qualification index, manifest, service worker, release metadata, offline manifest, and field-host marker are reachable over HTTPS. |
| P45-FIELD-01 | Honest launch state | Empty evidence produces `P45_FIELDWORK_READY`, never certification. |
| P45-FIELD-02 | Human layer | At least 3 distinct physical-device human sessions, at least 2 none/light familiarity, all existing R9 metric gates retained. |
| P45-FIELD-03 | Device matrix | Windows Chromium, macOS Safari, Android Chromium, iOS Safari, iPadOS Safari physical slots all covered. |
| P45-FIELD-04 | Journey coverage | J01–J10 each have a qualifying physical-device result somewhere in the matrix. |
| P45-FIELD-05 | PWA recovery | At least one physical installed-PWA run qualifies J10. |
| P45-FIELD-06 | No synthetic results | Automation may build, host, validate, aggregate, and hash evidence but may not generate observations/results. |
| P45-FIELD-07 | Failure preservation | Failed observations and blocking defects remain committed; retries use new evidence files. |
| P45-FIELD-08 | Ledger synchronization | `field-host.json` fieldwork state must match derived P44 campaign state. |
| P45-CERT-01 | Final certification | P45 closes only after combined R9 certification exists and contract reports `P45_FIELDWORK_CERTIFIED`. |
| P45-SAFE-01 | No product mutation | Field-launch PR changes deployment/qualification tooling and docs only; frozen P42 consumer baseline remains unchanged. |
| P45-CI-01 | Release qualification | PDF Studio CI, exact-dist browser/privacy, consumer performance, R10, and Pages field-host smoke all pass. |
