# Phase 34 Acceptance Matrix

| ID | Requirement | Evidence / Gate |
| --- | --- | --- |
| P34-POLICY-01 | A matching Stable tag causes Pages deployment to be skipped, not failed. | `deployment-policy` workflow job + unit policy regression. |
| P34-POLICY-02 | Main CI remains independent from Pages deployment eligibility. | Existing CI/performance/R10 workflows continue on every PR/main push. |
| P34-POLICY-03 | A version without a matching Stable tag enables full candidate qualification. | `should_deploy=true` branch in deployment policy. |
| P34-POLICY-04 | Manual dispatch cannot bypass same-version Stable protection. | Shared deployment-policy job applies to all workflow events. |
| P34-QUAL-01 | Candidate Pages changes still require the existing full qualification job. | `qualify-build` remains a dependency of `deploy`. |
| P34-SMOKE-01 | Deployment smoke validates the actual package version dynamically. | `EXPECTED_VERSION` from policy output. |
| P34-SMOKE-02 | Release-candidate channel remains explicit for candidate Pages builds. | Build env and release metadata smoke check. |
| P34-REG-01 | Workflow no longer emits an expected failure solely because the current version is already Stable. | Main push after merge should show deployment policy success with qualification/deploy/smoke skipped. |

## Merge gate

Merge only after PDF Studio CI, consumer performance, and R10 operational-readiness succeed on the final P34 head. After merge, verify the main-branch Pages workflow concludes successfully while preserving the current Stable deployment.
