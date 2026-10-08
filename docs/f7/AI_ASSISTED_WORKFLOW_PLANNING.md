# F7 — AI-Assisted Workflow Planning & Controlled Execution

## Dependency and deployment

F7 is stacked on F6, which is stacked on F5. Merge in dependency order. F7 adds **no new PDF processing engine**; the F5 headless registry and F6 local orchestrator remain the only authoritative mechanisms for executing changes.

The shared `thiepn/ai` service is HMAC-authenticated with **server-side-only** credentials and currently has no validated `pdf.planWorkflow` capability. Since PDF Studio is delivered as a browser app, **do not** import the `@thiepn/ai` SDK into its bundle or place credentials in a frontend environment variable.

F7 therefore implements a working **manual ChatGPT planner bridge** without falsely claiming integrated in-app GPT-6 Luna calls.

## User journey

1. In the Batch / Visual Workflow Composer, enter a natural-language objective.
2. Choose **Copy ChatGPT prompt**, then **Open ChatGPT**. The bounded prompt includes the user's goal, the public ten-action F5 catalog, exact parameters, terminal ordering and safety constraints. No files, filenames, bytes, passwords, text extracted from PDFs, or application storage are sent by PDF Studio.
3. Paste the prompt into ChatGPT and copy the model's JSON response.
4. Paste the JSON into PDF Studio; press **Review proposed workflow**.
5. Review the rationale, exact action IDs and options, step replacement count, ZIP/PDF output, warnings and destructive effects.
6. Check the **Replace workflow** authorization and choose **Apply proposal to composer**.
7. Edit the resulting steps in F6 if needed. If metadata removal/rasterization is present, independently approve their effects using the existing F6 checkbox. Add PDFs and click **Run workflow** to execute locally.

At **no point** do the ChatGPT response or the imported plan have permission to save, upload, execute, erase files, approve risk, download files, or cause network calls.

## Machine-readable proposal v1

```json
{
  "schemaVersion": 1,
  "title": "Prepare submission",
  "rationale": "Rotate source pages before splitting.",
  "actions": [
    { "actionId": "pdf.rotate", "params": { "degrees": 90 } },
    { "actionId": "pdf.split.fixed", "params": { "pagesPerFile": 5 } }
  ],
  "notes": ["Check output before distributing it."]
}
```

`src/automation/aiWorkflowPlanning.ts` handles the protocol. JSON-only, optional single Markdown JSON code fence, maximum 24,000 characters, between 1 and 32 actions. Schema version and all fields are strictly allowlisted. Unknown `actionId`, `params`, extra properties, `approvedRisks`, executable code, instructions to auto-run, and invalid terminal ordering are rejected **before** a draft is made.

Strict action parsing uses `validateActionRequest()`; ordered plan parsing uses `planHeadlessActions()`; final draft checks use F6 `validateWorkflowDraft()`.

Untrusted action proposals are never a source of authorization. The model cannot approve removal of metadata or rasterization. The parser deliberately omits `approvedRisks` from model input. Drafts never contain model-supplied step IDs, and application generates fresh unique IDs on explicit apply.

The reviewer captures the output-affecting fingerprint of the current workflow; if the workflow changes while the review is open, applying the proposal is blocked until it is reviewed again. Editing pasted JSON also clears approval.

## Internal UI

- `AIWorkflowPlanner.tsx`: user goal, copy prompt, optional manual copy, ChatGPT navigation, JSON paste, review and explicit apply.
- `aiWorkflowPlanner.css`: responsive restrained UI inside existing batch page.
- `BatchPage.tsx`: imports and mounts the planner. Application clears old F6 destructive-operation consent, stale run evidence and error status; output-fingerprint invalidation continues to work.
- Existing stored workflow name, output suffix and identity are **not** overwritten by AI proposals. AI title is review-only.

## Limits and future extension

- ChatGPT does not have direct access to the PDF Studio repository, browser or documents through this bridge.
- This phase is **not** native real-time AI chat or autonomous workflow execution; using the external ChatGPT UI and pasting structured JSON is part of the intended workflow.
- Future direct Luna integration must introduce a dedicated, server-side `pdf.planWorkflow` capability with authenticated user context, registered `pdf` app ID, policy checks, strict structured output, budget and latency limits, a safe server deployment and UI fallback. Even then, the same F7 parser and F6 approvals remain authoritative.
- Complex requests unsupported by the action catalog can only be partially satisfied. Generated claims about preservation and output correctness are not treated as evidence.

## Verification

- Strict unit tests for injection, spoofed permissions, invalid options, stale plans, terminal ordering, maximum sizes, draft identity and destructive risks.
- Chromium flow tests for constrained prompt generation, JSON staging, rejection of forged approvals, stale proposal invalidation and explicit local execution.
- Existing F5/F6 unit regressions and full project production/typecheck/performance/readiness checks.
- Release must not proceed until CI is green and reviewers confirm no secrets or PDF bytes are transmitted.
