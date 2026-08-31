# P44 — Qualification Campaign Orchestrator Acceptance Matrix

| ID | Requirement | Acceptance |
| --- | --- | --- |
| P44-01 | Frozen baseline | Campaign plan and status engine require `be223e37d3ecafe6695aa6fe4fe7f901f95f478c`. |
| P44-02 | No manufactured evidence | P44 creates no human session/device-run evidence and pre-fills no outcomes. |
| P44-03 | Human sample gaps | Status output reports remaining distinct-tester and none/light-familiarity shortfalls. |
| P44-04 | Device matrix gaps | Status output reports every missing required physical-device slot. |
| P44-05 | Journey gaps | Status output reports every missing J01–J10 journey. |
| P44-06 | PWA recovery gap | Status output explicitly reports whether installed-PWA J10 recovery coverage is still missing. |
| P44-07 | Defect visibility | Critical/data-loss blocking defects from human sessions or device runs block the campaign and remain in output. |
| P44-08 | Measured misses | `HUMAN_UX_TARGET_MISSED` or `REAL_DEVICE_TARGET_MISSED` produces `P44_CAMPAIGN_BLOCKED`; evidence is not discarded. |
| P44-09 | Field-ready state | Empty valid evidence directories produce `P44_CAMPAIGN_READY_FOR_FIELDWORK`, not a pass/certification claim. |
| P44-10 | In-progress state | Partial valid evidence produces `P44_CAMPAIGN_IN_PROGRESS`. |
| P44-11 | Ready-to-certify state | Both P43/R9 targets met with no certificate produces `P44_CAMPAIGN_READY_TO_CERTIFY`. |
| P44-12 | Certified state | A structurally valid combined R9 certificate matching the frozen baseline produces `P44_CAMPAIGN_CERTIFIED`. |
| P44-13 | Invalid certification fails closed | A present but inconsistent certification record blocks the campaign. |
| P44-14 | Next action guidance | Every nonterminal campaign state returns concrete next actions derived from remaining gaps. |
| P44-15 | CI contract | Node unit tests and live repository campaign-status validation run in PDF Studio CI. |
| P44-16 | Product behavior unchanged | No `src/`, PDF processing, persistence, worker, routing, or consumer UI behavior changes. |
| P44-17 | Existing release gates | Full PDF Studio CI, Consumer performance budget, and R10 policy must pass on the exact merge candidate. |
